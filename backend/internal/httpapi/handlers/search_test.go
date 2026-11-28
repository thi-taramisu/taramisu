package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

// searchFake answers the search query; the router's other stores stay nil and are never called.
type searchFake struct {
	httpapi.Queries
	params db.SearchElementsParams
	calls  int
	rows   []db.SearchElementsRow
}

func (f *searchFake) SearchElements(_ context.Context, p db.SearchElementsParams) ([]db.SearchElementsRow, error) {
	f.params = p
	f.calls++
	return f.rows, nil
}

type searchPage struct {
	Results []struct {
		ID        string  `json:"id"`
		Type      string  `json:"type"`
		DisplayID *string `json:"display_id"`
		Name      string  `json:"name"`
		Project   struct{ ID, Name string }
		Item      *struct{ ID, Name string }
	} `json:"results"`
	Total      int64  `json:"total"`
	NextOffset *int64 `json:"next_offset"`
}

func searchRequest(t *testing.T, store *searchFake, query string, claims map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	fixture := authtest.NewFixture(t, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/search"+query, http.NoBody)
	req.Header.Set("Authorization", "Bearer "+fixture.Token(t, claims))
	rr := httptest.NewRecorder()
	httpapi.New(store, fixture.Manager).ServeHTTP(rr, req)
	return rr
}

func TestSearchPassesFiltersToQuery(t *testing.T) {
	store := &searchFake{}
	const projectID = "aaaaaaaa-0000-4000-8000-000000000001"
	rr := searchRequest(t, store,
		"?q=+ts-07+&type=threat-scenarios&type=assets&project_id="+projectID+"&limit=10&offset=20",
		map[string]any{"taramisu_groups": []string{teamGroupID}})
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body)
	}
	p := store.params
	if p.UserID != mustUUID(authtest.UserID) || len(p.GroupIds) != 1 || p.GroupIds[0] != teamGroupID {
		t.Errorf("caller = %v %v", p.UserID, p.GroupIds)
	}
	if p.Query != "ts-07" || p.IDType != "threat-scenarios" || p.IDDigits != "7" {
		t.Errorf("query = %q, id = %q %q", p.Query, p.IDType, p.IDDigits)
	}
	if len(p.Types) != 2 || p.Types[0] != "threat-scenarios" || p.Types[1] != "assets" {
		t.Errorf("types = %v", p.Types)
	}
	if len(p.ProjectIds) != 1 || p.ProjectIds[0] != mustUUID(projectID) || p.PageLimit != 10 || p.PageOffset != 20 {
		t.Errorf("projects = %v, limit = %d, offset = %d", p.ProjectIds, p.PageLimit, p.PageOffset)
	}
}

func TestSearchDefaults(t *testing.T) {
	store := &searchFake{}
	if rr := searchRequest(t, store, "?q=headlamp", nil); rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body)
	}
	p := store.params
	// Empty lists, not nil: the query compares their cardinality, and NULL would match nothing.
	if p.Types == nil || len(p.Types) != 0 || p.ProjectIds == nil || len(p.ProjectIds) != 0 || p.GroupIds == nil {
		t.Errorf("types = %#v, projects = %#v, groups = %#v", p.Types, p.ProjectIds, p.GroupIds)
	}
	if p.Query != "headlamp" || p.IDType != "" || p.IDDigits != "" || p.PageLimit != 50 || p.PageOffset != 0 {
		t.Errorf("query = %q, id = %q %q, limit = %d, offset = %d", p.Query, p.IDType, p.IDDigits, p.PageLimit, p.PageOffset)
	}
}

func TestSearchValidation(t *testing.T) {
	for _, query := range []string{
		"",
		"?q=",
		"?q=+++",
		"?q=%C2%A0",                      // no-break space only
		"?q=%E3%80%80",                   // ideographic space only
		"?q=%CC%81",                      // combining acute accent only, which unaccent removes
		"?q=%CC%81%20%CC%81",             // accents and a space
		"?q=a%00b",                       // NUL, which PostgreSQL rejects in text
		"?q=%FF",                         // invalid UTF-8
		"?q=" + strings.Repeat("a", 101), // longer than the 100 allowed characters
		"?q=a&type=risks",
		"?q=a&project_id=not-a-uuid",
		"?q=a&limit=0",
		"?q=a&limit=101",
		"?q=a&offset=-1",
		"?q=a&offset=2147483648", // would wrap around in int32
	} {
		store := &searchFake{}
		if rr := searchRequest(t, store, query, nil); rr.Code != http.StatusUnprocessableEntity || store.calls != 0 {
			t.Errorf("%q: status = %d, calls = %d: %s", query, rr.Code, store.calls, rr.Body)
		}
	}
}

func TestSearchResponse(t *testing.T) {
	number := int32(12)
	itemName := "Headlamp"
	project := mustUUID("aaaaaaaa-0000-4000-8000-000000000001")
	item := mustUUID("bbbbbbbb-0000-4000-8000-000000000001")
	store := &searchFake{rows: []db.SearchElementsRow{
		{Type: "projects", ID: project, Name: "Vehicle", ProjectID: project, ProjectName: "Vehicle", Total: 5},
		{Type: "threat-scenarios", ID: mustUUID("cccccccc-0000-4000-8000-000000000001"), DisplayNumber: &number,
			Name: "Spoofed camera frames", ProjectID: project, ProjectName: "Vehicle", ItemID: item, ItemName: &itemName, Total: 5},
	}}
	decode := func(rr *httptest.ResponseRecorder) searchPage {
		t.Helper()
		var page searchPage
		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", rr.Code, rr.Body)
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		return page
	}

	page := decode(searchRequest(t, store, "?q=v&limit=2", nil))
	if page.Total != 5 || page.NextOffset == nil || *page.NextOffset != 2 || len(page.Results) != 2 {
		t.Fatalf("page = %+v", page)
	}
	if r := page.Results[0]; r.Type != "projects" || r.DisplayID != nil || r.Item != nil || r.Project.ID != project.String() {
		t.Errorf("project result = %+v", r)
	}
	if r := page.Results[1]; r.DisplayID == nil || *r.DisplayID != "TS-12" || r.Item == nil || r.Item.ID != item.String() || r.Item.Name != "Headlamp" {
		t.Errorf("threat scenario result = %+v", r)
	}

	// The last page has no next offset.
	if page := decode(searchRequest(t, store, "?q=v&limit=2&offset=3", nil)); page.NextOffset != nil {
		t.Errorf("last page next_offset = %d", *page.NextOffset)
	}
	// A page past the last match is empty, not an error.
	store.rows = nil
	if page := decode(searchRequest(t, store, "?q=v&offset=100", nil)); page.Results == nil || page.Total != 0 || page.NextOffset != nil {
		t.Errorf("empty page = %+v", page)
	}
}
