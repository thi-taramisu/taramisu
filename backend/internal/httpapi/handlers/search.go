package handlers

import (
	"context"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// Global search over the projects the caller can access (#240, docs/internal/adr/0005-backend-search.md).
// The access filter is part of the query (db/queries/search.sql), so the operation has no project.

// SearchStore is implemented by the sqlc-generated queries.
type SearchStore interface {
	SearchElements(context.Context, db.SearchElementsParams) ([]db.SearchElementsRow, error)
}

type Search struct {
	store SearchStore
}

func NewSearch(store SearchStore) *Search {
	return &Search{store: store}
}

func (h *Search) Register(api huma.API) {
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Search", Description: "Search projects and their elements across all accessible projects.",
	})
	Register(api, huma.Operation{
		OperationID: "search", Method: http.MethodGet, Path: "/api/v1/search",
		Summary: "Search projects and elements",
		Description: "Finds projects and elements by name or title, tolerating small typos, and elements by display ID " +
			"(`TS-12`, `ts12`, `TS-012`; `TS-1` also finds IDs whose number starts with 1, such as `TS-10`). Only projects the caller has a role in are searched.",
		Tags: []string{"Search"}, Security: []map[string][]string{{"bearer": {}}},
		Errors: []int{http.StatusUnauthorized, http.StatusUnprocessableEntity},
	}, WithoutProject(), h.Search)
}

// Result types; the values match the frontend's route segments.
const (
	searchTypeProject        = "projects"
	searchTypeItem           = "items"
	searchTypeAsset          = "assets"
	searchTypeDamageScenario = "damage-scenarios"
	searchTypeThreatScenario = "threat-scenarios"
	searchTypeAttackPath     = "attack-paths"
)

// displayPrefixes maps result types to their display ID prefix (see display_id.go).
var displayPrefixes = map[string]string{
	searchTypeItem:           displayPrefixItem,
	searchTypeAsset:          displayPrefixAsset,
	searchTypeDamageScenario: displayPrefixDamageScenario,
	searchTypeThreatScenario: displayPrefixThreatScenario,
	searchTypeAttackPath:     displayPrefixAttackPath,
}

type SearchInput struct {
	Query      string   `query:"q" required:"true" minLength:"1" maxLength:"100" doc:"Name, title, or display ID to search for"`
	ProjectIDs []string `query:"project_id,explode" format:"uuid" maxItems:"100" nullable:"false" doc:"Only search these projects; projects without a role return nothing"`
	Types      []string `query:"type,explode" enum:"projects,items,assets,damage-scenarios,threat-scenarios,attack-paths" nullable:"false" doc:"Only return these result types"`
	Limit      int32    `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset     int32    `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

type SearchRef struct {
	ID   string `json:"id" format:"uuid"`
	Name string `json:"name"`
}

type SearchResult struct {
	ID        string    `json:"id" format:"uuid"`
	Type      string    `json:"type" enum:"projects,items,assets,damage-scenarios,threat-scenarios,attack-paths"`
	DisplayID *string   `json:"display_id" nullable:"true" example:"TS-12" doc:"Display ID of the element; null for projects"`
	Name      string    `json:"name" doc:"Name or title"`
	Project   SearchRef `json:"project"`
	// Omitted rather than null: Huma cannot mark a referenced object schema as nullable.
	Item *SearchRef `json:"item,omitempty" doc:"Item of the element; omitted for projects and items"`
}

type SearchPage struct {
	Results    []SearchResult `json:"results" nullable:"false"`
	Total      int64          `json:"total" doc:"Number of all matches; 0 for a page past the last match"`
	NextOffset *int64         `json:"next_offset" nullable:"true" doc:"Offset of the next page, or null on the last page"`
}

type SearchOutput struct {
	Body SearchPage
}

func (h *Search) Search(ctx context.Context, in *SearchInput) (*SearchOutput, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return nil, err
	}
	projectIDs := make([]pgtype.UUID, 0, len(in.ProjectIDs))
	for _, s := range in.ProjectIDs {
		id, err := parseUUID(s)
		if err != nil {
			return nil, err
		}
		projectIDs = append(projectIDs, id)
	}
	types := in.Types
	if types == nil {
		types = []string{}
	}
	// PostgreSQL rejects NUL and invalid UTF-8 in text, so they are input errors, not server errors.
	query := strings.TrimSpace(in.Query)
	if !utf8.ValidString(query) || strings.ContainsRune(query, 0) {
		return nil, huma.Error422UnprocessableEntity("q must be valid UTF-8 without NUL characters")
	}
	if !hasSearchableText(query) {
		return nil, huma.Error422UnprocessableEntity("q must contain letters, digits, or symbols")
	}
	idType, idDigits := parseDisplayID(query)
	rows, err := h.store.SearchElements(ctx, db.SearchElementsParams{
		UserID:     userID,
		GroupIds:   callerGroups(ctx),
		ProjectIds: projectIDs,
		Types:      types,
		Query:      query,
		IDType:     idType,
		IDDigits:   idDigits,
		PageLimit:  in.Limit,
		PageOffset: in.Offset,
	})
	if err != nil {
		return nil, err
	}
	out := &SearchOutput{}
	out.Body.Results = make([]SearchResult, 0, len(rows))
	for _, row := range rows {
		out.Body.Results = append(out.Body.Results, searchResult(row))
		out.Body.Total = row.Total
	}
	if next := int64(in.Offset) + int64(len(rows)); next < out.Body.Total {
		out.Body.NextOffset = &next
	}
	return out, nil
}

func searchResult(row db.SearchElementsRow) SearchResult {
	result := SearchResult{
		ID: row.ID.String(), Type: row.Type, Name: row.Name,
		Project: SearchRef{ID: row.ProjectID.String(), Name: row.ProjectName},
	}
	if prefix, ok := displayPrefixes[row.Type]; ok && row.DisplayNumber != nil {
		id := displayID(prefix, *row.DisplayNumber)
		result.DisplayID = &id
	}
	if row.ItemID.Valid && row.ItemName != nil {
		result.Item = &SearchRef{ID: row.ItemID.String(), Name: *row.ItemName}
	}
	return result
}

// hasSearchableText reports whether s has a character other than spaces and combining marks. Queries of
// only Unicode spaces (U+00A0, which a pattern tag would let through) or lone accents (U+0301, which
// unaccent removes) would otherwise match every name.
func hasSearchableText(s string) bool {
	for _, r := range s {
		if !unicode.IsSpace(r) && !unicode.Is(unicode.Mn, r) && !unicode.Is(unicode.Me, r) {
			return true
		}
	}
	return false
}

// displayIDPattern accepts a display ID with or without separator and leading zeros: TS-12, ts12, TS 012.
var displayIDPattern = regexp.MustCompile(`(?i)^(IT|AS|DS|TS|AP)\s*-?\s*(\d{1,9})$`)

// parseDisplayID returns the result type and the number without leading zeros if query is a display ID,
// otherwise two empty strings. The search matches elements of that type whose number starts with it.
func parseDisplayID(query string) (resultType, digits string) {
	m := displayIDPattern.FindStringSubmatch(query)
	if m == nil {
		return "", ""
	}
	number, err := strconv.Atoi(m[2])
	if err != nil || number == 0 {
		return "", ""
	}
	prefix := strings.ToUpper(m[1])
	for resultType, p := range displayPrefixes {
		if p == prefix {
			return resultType, strconv.Itoa(number)
		}
	}
	return "", ""
}
