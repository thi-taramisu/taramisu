package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ErrPrincipalNotFound is returned when an external IAM user or group UUID does not exist in Authentik.
var ErrPrincipalNotFound = errors.New("IAM principal not found")

// ErrAmbiguousEmail is returned when several active Authentik users share an email address. Authentik does not
// enforce unique email addresses, so such an address does not identify one person.
var ErrAmbiguousEmail = errors.New("several active users share this email address")

// UserMetadata holds display metadata resolved on-the-fly from Authentik without storing PII in taramisu-db.
type UserMetadata struct {
	Subject  string `json:"subject"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Email    string `json:"email"`
}

// GroupMetadata holds display metadata for an Authentik group.
type GroupMetadata struct {
	GroupID string `json:"group_id"`
	Name    string `json:"name"`
	// Assignable reports whether the group carries the taramisu_assignable attribute.
	Assignable bool `json:"assignable"`
}

// DirectoryConfig configures the Authentik Core API client and in-memory TTL cache.
type DirectoryConfig struct {
	BaseURL    string
	Token      string
	TTL        time.Duration
	MaxEntries int
	HTTPClient *http.Client
}

// DirectoryResolver resolves external_iam_sub subjects and external_iam_group_id UUIDs via Authentik's Core API
// and caches display metadata in memory per replica (Decisions 5 & 8).
type DirectoryResolver struct {
	baseURL string
	token   string
	client  *http.Client
	users   *ttlCache[string, UserMetadata]
	groups  *ttlCache[string, GroupMetadata]

	// listMu guards listedAt, the time of the last full user list read. Unknown subjects (for
	// example deleted accounts) are not looked up again until the cache TTL has passed.
	listMu   sync.Mutex
	listedAt time.Time
	listTTL  time.Duration
}

// NewDirectoryResolver validates the configuration and constructs a cached Authentik directory resolver.
func NewDirectoryResolver(cfg DirectoryConfig) (*DirectoryResolver, error) {
	trimmed := strings.TrimRight(cfg.BaseURL, "/")
	parsed, err := url.Parse(trimmed)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
		return nil, errors.New("AUTHENTIK_API_URL must be a valid http(s) URL without credentials or query parameters")
	}
	if strings.TrimSpace(cfg.Token) == "" {
		return nil, errors.New("AUTHENTIK_API_TOKEN is required")
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	users := newTTLCache[string, UserMetadata](cfg.TTL, cfg.MaxEntries)
	return &DirectoryResolver{
		baseURL: trimmed,
		token:   cfg.Token,
		client:  client,
		users:   users,
		groups:  newTTLCache[string, GroupMetadata](cfg.TTL, cfg.MaxEntries),
		listTTL: users.ttl,
	}, nil
}

// authentikUser is the subset of an Authentik Core API user that Taramisu reads.
// uid is the hashed user ID that the OIDC provider sends as the token subject (sub_mode: hashed_user_id).
type authentikUser struct {
	UID      string `json:"uid"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	IsActive bool   `json:"is_active"`
}

func (u authentikUser) metadata() UserMetadata {
	return UserMetadata{Subject: u.UID, Username: u.Username, Name: u.Name, Email: u.Email}
}

type authentikPage[T any] struct {
	Pagination struct {
		Next int `json:"next"`
	} `json:"pagination"`
	Results []T `json:"results"`
}

// maxDirectoryPages bounds paginated directory reads (100 entries per page).
const maxDirectoryPages = 50

// listAll reads every page of an Authentik list endpoint. query must not contain page parameters.
func listAll[T any](ctx context.Context, d *DirectoryResolver, path string, query url.Values) ([]T, error) {
	var all []T
	page := 1
	for range maxDirectoryPages {
		query.Set("page", strconv.Itoa(page))
		query.Set("page_size", "100")
		var response authentikPage[T]
		if err := d.getJSON(ctx, d.baseURL+path+"?"+query.Encode(), &response); err != nil {
			return nil, err
		}
		all = append(all, response.Results...)
		if response.Pagination.Next <= page {
			return all, nil
		}
		page = response.Pagination.Next
	}
	return nil, errors.New("authentik directory has too many pages")
}

// ResolveUser returns display metadata for a token subject (external_iam_sub), serving from the local TTL cache when fresh.
// Authentik cannot filter users by the hashed subject, so a cache miss reads the user list once and caches every user.
// After a full read, a subject that is still unknown returns ErrPrincipalNotFound without another read until the TTL
// has passed, so deleted accounts in a member list do not trigger one full read each.
func (d *DirectoryResolver) ResolveUser(ctx context.Context, subject string) (UserMetadata, error) {
	if subject == "" {
		return UserMetadata{}, errors.New("subject is required")
	}
	if cached, ok := d.users.get(subject); ok {
		return cached, nil
	}
	d.listMu.Lock()
	defer d.listMu.Unlock()
	// Another request may have read the list while this one waited for the lock.
	if cached, ok := d.users.get(subject); ok {
		return cached, nil
	}
	if !d.listedAt.IsZero() && d.users.now().Sub(d.listedAt) < d.listTTL {
		return UserMetadata{}, ErrPrincipalNotFound
	}
	users, err := listAll[authentikUser](ctx, d, "/api/v3/core/users/", url.Values{})
	if err != nil {
		return UserMetadata{}, err
	}
	d.listedAt = d.users.now()
	var found *UserMetadata
	for _, user := range users {
		if user.UID == "" {
			continue
		}
		meta := user.metadata()
		d.users.set(user.UID, meta)
		if user.UID == subject {
			found = &meta
		}
	}
	if found == nil {
		return UserMetadata{}, ErrPrincipalNotFound
	}
	return *found, nil
}

// FindActiveUserByEmail returns the active Authentik user with this email address, ignoring case.
// Its Subject is the value the user's tokens carry in the sub claim. Authentik's email filter is
// case-sensitive, so this uses the search parameter (substring match on email, name, and
// username) and compares the email here. If several active users match, it returns
// ErrAmbiguousEmail instead of picking one.
func (d *DirectoryResolver) FindActiveUserByEmail(ctx context.Context, email string) (UserMetadata, error) {
	email = strings.TrimSpace(email)
	if email == "" {
		return UserMetadata{}, errors.New("email is required")
	}
	users, err := listAll[authentikUser](ctx, d, "/api/v3/core/users/", url.Values{"search": {email}, "is_active": {"true"}})
	if err != nil {
		return UserMetadata{}, err
	}
	var found *UserMetadata
	for _, user := range users {
		if !user.IsActive || user.UID == "" || !strings.EqualFold(user.Email, email) {
			continue
		}
		if found != nil && found.Subject != user.UID {
			return UserMetadata{}, ErrAmbiguousEmail
		}
		meta := user.metadata()
		d.users.set(user.UID, meta)
		found = &meta
	}
	if found == nil {
		return UserMetadata{}, ErrPrincipalNotFound
	}
	return *found, nil
}

// authentikGroup is the subset of an Authentik Core API group that Taramisu reads.
type authentikGroup struct {
	PK         string         `json:"pk"`
	Name       string         `json:"name"`
	Attributes map[string]any `json:"attributes"`
}

func (g authentikGroup) metadata() GroupMetadata {
	assignable, _ := g.Attributes[AssignableGroupAttribute].(bool)
	return GroupMetadata{GroupID: g.PK, Name: g.Name, Assignable: assignable}
}

// AssignableGroupAttribute marks Authentik groups that project Owners may give a project role.
const AssignableGroupAttribute = "taramisu_assignable"

// ResolveGroup returns display metadata for an Authentik group UUID (external_iam_group_id), serving from the local TTL cache when fresh.
func (d *DirectoryResolver) ResolveGroup(ctx context.Context, groupID string) (GroupMetadata, error) {
	if groupID == "" {
		return GroupMetadata{}, errors.New("group ID is required")
	}
	if cached, ok := d.groups.get(groupID); ok {
		return cached, nil
	}

	endpoint := d.baseURL + "/api/v3/core/groups/" + url.PathEscape(groupID) + "/"
	var item authentikGroup
	if err := d.getJSON(ctx, endpoint, &item); err != nil {
		return GroupMetadata{}, err
	}
	if item.PK == "" {
		return GroupMetadata{}, ErrPrincipalNotFound
	}
	meta := item.metadata()
	d.groups.set(groupID, meta)
	return meta, nil
}

// ListAssignableGroups returns all Authentik groups with the taramisu_assignable attribute set to true.
func (d *DirectoryResolver) ListAssignableGroups(ctx context.Context) ([]GroupMetadata, error) {
	filter := url.Values{"attributes": {`{"` + AssignableGroupAttribute + `": true}`}}
	groups, err := listAll[authentikGroup](ctx, d, "/api/v3/core/groups/", filter)
	if err != nil {
		return nil, err
	}
	out := make([]GroupMetadata, 0, len(groups))
	for _, group := range groups {
		meta := group.metadata()
		if meta.Assignable && meta.GroupID != "" {
			d.groups.set(meta.GroupID, meta)
			out = append(out, meta)
		}
	}
	return out, nil
}

func (d *DirectoryResolver) getJSON(ctx context.Context, endpoint string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, http.NoBody)
	if err != nil {
		return fmt.Errorf("create Authentik request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+d.token)
	req.Header.Set("Accept", "application/json")

	// #nosec G704 -- BaseURL is validated at startup and parameters are URL-escaped.
	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("query Authentik directory: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode == http.StatusNotFound {
		return ErrPrincipalNotFound
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected Authentik status %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("decode Authentik response: %w", err)
	}
	return nil
}
