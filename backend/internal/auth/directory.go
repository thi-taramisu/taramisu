package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrPrincipalNotFound is returned when an external IAM user or group UUID does not exist in Authentik.
var ErrPrincipalNotFound = errors.New("IAM principal not found")

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
}

// DirectoryConfig configures the Authentik Core API client and in-memory TTL cache.
type DirectoryConfig struct {
	BaseURL    string
	Token      string
	TTL        time.Duration
	MaxEntries int
	HTTPClient *http.Client
}

// DirectoryResolver resolves external_iam_sub and external_iam_group_id UUIDs via Authentik's Core API
// and caches display metadata in memory per replica (Decisions 5 & 8).
type DirectoryResolver struct {
	baseURL string
	token   string
	client  *http.Client
	users   *ttlCache[string, UserMetadata]
	groups  *ttlCache[string, GroupMetadata]
}

// NewDirectoryResolver validates the configuration and constructs a cached Authentik directory resolver.
func NewDirectoryResolver(cfg DirectoryConfig) (*DirectoryResolver, error) {
	trimmed := strings.TrimRight(cfg.BaseURL, "/")
	parsed, err := url.Parse(trimmed)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
		return nil, errors.New("AUTHENTIK_URL must be a valid http(s) URL without credentials or query parameters")
	}
	if strings.TrimSpace(cfg.Token) == "" {
		return nil, errors.New("AUTHENTIK_TOKEN is required")
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	return &DirectoryResolver{
		baseURL: trimmed,
		token:   cfg.Token,
		client:  client,
		users:   newTTLCache[string, UserMetadata](cfg.TTL, cfg.MaxEntries),
		groups:  newTTLCache[string, GroupMetadata](cfg.TTL, cfg.MaxEntries),
	}, nil
}

// ResolveUser returns display metadata for an Authentik user UUID (external_iam_sub), serving from the local TTL cache when fresh.
func (d *DirectoryResolver) ResolveUser(ctx context.Context, subject string) (UserMetadata, error) {
	if subject == "" {
		return UserMetadata{}, errors.New("subject is required")
	}
	if cached, ok := d.users.get(subject); ok {
		return cached, nil
	}

	endpoint := d.baseURL + "/api/v3/core/users/?uuid=" + url.QueryEscape(subject)
	var response struct {
		Results []struct {
			UUID     string `json:"uuid"`
			Username string `json:"username"`
			Name     string `json:"name"`
			Email    string `json:"email"`
		} `json:"results"`
	}
	if err := d.getJSON(ctx, endpoint, &response); err != nil {
		return UserMetadata{}, err
	}
	for _, item := range response.Results {
		if item.UUID == subject {
			meta := UserMetadata{
				Subject:  item.UUID,
				Username: item.Username,
				Name:     item.Name,
				Email:    item.Email,
			}
			d.users.set(subject, meta)
			return meta, nil
		}
	}
	return UserMetadata{}, ErrPrincipalNotFound
}

// ResolveGroup returns display metadata for an Authentik group UUID (external_iam_group_id), serving from the local TTL cache when fresh.
func (d *DirectoryResolver) ResolveGroup(ctx context.Context, groupID string) (GroupMetadata, error) {
	if groupID == "" {
		return GroupMetadata{}, errors.New("group ID is required")
	}
	if cached, ok := d.groups.get(groupID); ok {
		return cached, nil
	}

	endpoint := d.baseURL + "/api/v3/core/groups/" + url.PathEscape(groupID) + "/"
	var item struct {
		PK   string `json:"pk"`
		Name string `json:"name"`
	}
	if err := d.getJSON(ctx, endpoint, &item); err != nil {
		return GroupMetadata{}, err
	}
	if item.PK == "" {
		return GroupMetadata{}, ErrPrincipalNotFound
	}
	meta := GroupMetadata{
		GroupID: item.PK,
		Name:    item.Name,
	}
	d.groups.set(groupID, meta)
	return meta, nil
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
