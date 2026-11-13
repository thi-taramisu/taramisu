package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const projectID = "11111111-1111-1111-1111-111111111111"

type fakeProjects struct {
	handlers.RiskValueStore
	handlers.RiskTreatmentDecisionStore
	statusReaderFunc
	handlers.AttackPathStore
	handlers.AttackFeasibilityRatingStore
	handlers.ThreatAttackPathLinkStore
	handlers.DamageScenarioStore
	handlers.ImpactRatingStore
	handlers.ThreatDamageLinkStore
	handlers.ProjectAccessStore
	handlers.ProjectMemberStore
	handlers.ItemDefinitionStore
	handlers.AssetStore
	handlers.AssetCybersecurityPropertyStore
	handlers.DamagePropertyLinkStore
	handlers.ThreatPropertyLinkStore
	project   db.TaraProject
	found     bool
	deleteErr error
	audit     auditRecorder
	deletedBy db.Actor
	// role is the caller's role returned by GetProjectRole; empty means no role.
	role       db.ProjectRole
	roleQuery  db.GetProjectRoleParams
	listQuery  db.ListTaraProjectsParams
	createdFor pgtype.UUID
}

func newFakeProjects(found bool) *fakeProjects {
	var id pgtype.UUID
	_ = id.Scan(projectID)
	desc := "desc"
	return &fakeProjects{
		found: found,
		role:  db.ProjectRoleOWNER,
		project: db.TaraProject{
			ID:          id,
			Name:        "proj",
			Description: &desc,
			CreatedAt:   pgtype.Timestamptz{Time: time.Unix(0, 0).UTC(), Valid: true},
		},
	}
}

func (f *fakeProjects) GetProjectRole(_ context.Context, a db.GetProjectRoleParams) (db.ProjectRole, error) {
	f.roleQuery = a
	if f.role == "" {
		return "", pgx.ErrNoRows
	}
	return f.role, nil
}

func (f *fakeProjects) CreateTaraProject(_ context.Context, a db.CreateTaraProjectParams) (db.CreateTaraProjectRow, error) {
	f.createdFor = a.OwnerID
	p := f.project
	return db.CreateTaraProjectRow{ID: p.ID, Name: a.Name, Description: a.Description, CreatedAt: p.CreatedAt}, nil
}

func (f *fakeProjects) GetTaraProjectForUpdate(ctx context.Context, id pgtype.UUID) (db.TaraProject, error) {
	return f.GetTaraProject(ctx, id)
}

func (f *fakeProjects) GetTaraProject(context.Context, pgtype.UUID) (db.TaraProject, error) {
	if !f.found {
		return db.TaraProject{}, pgx.ErrNoRows
	}
	return f.project, nil
}

func (f *fakeProjects) ListTaraProjects(_ context.Context, a db.ListTaraProjectsParams) ([]db.ListTaraProjectsRow, error) {
	f.listQuery = a
	if !f.found {
		return nil, nil
	}
	p := f.project
	return []db.ListTaraProjectsRow{{ID: p.ID, Name: p.Name, Description: p.Description, CreatedAt: p.CreatedAt, Role: f.role}}, nil
}

func (f *fakeProjects) ReplaceTaraProject(_ context.Context, a db.ReplaceTaraProjectParams) (db.TaraProject, error) {
	if !f.found {
		return db.TaraProject{}, pgx.ErrNoRows
	}
	p := f.project
	p.Name, p.Description = a.Name, a.Description
	return p, nil
}

func (f *fakeProjects) UpdateTaraProject(_ context.Context, a db.UpdateTaraProjectParams) (db.TaraProject, error) {
	if !f.found {
		return db.TaraProject{}, pgx.ErrNoRows
	}
	p := f.project
	if a.Name != nil {
		p.Name = *a.Name
	}
	if a.SetDescription {
		p.Description = a.Description
	}
	return p, nil
}

func (f *fakeProjects) DeleteTaraProject(_ context.Context, actor db.Actor, _ pgtype.UUID) error {
	f.deletedBy = actor
	if f.deleteErr != nil {
		return f.deleteErr
	}
	if !f.found {
		return db.ErrProjectNotFound
	}
	return nil
}

func TestTaraProjectRoutes(t *testing.T) {
	base := "/api/v1/projects"
	manager, bearer := authtest.NewManagerAndToken(t)
	for _, tc := range []struct {
		name   string
		found  bool
		method string
		path   string
		body   string
		code   int
	}{
		{"create", true, http.MethodPost, base, `{"name":"a"}`, http.StatusCreated},
		{"create empty name", true, http.MethodPost, base, `{"name":""}`, http.StatusUnprocessableEntity},
		{"create whitespace name", true, http.MethodPost, base, `{"name":"   "}`, http.StatusUnprocessableEntity},
		{"list", true, http.MethodGet, base, "", http.StatusOK},
		{"list empty", false, http.MethodGet, base, "", http.StatusOK},
		{"get", true, http.MethodGet, base + "/" + projectID, "", http.StatusOK},
		{"get missing", false, http.MethodGet, base + "/" + projectID, "", http.StatusNotFound},
		{"get bad id", true, http.MethodGet, base + "/nope", "", http.StatusUnprocessableEntity},
		{"replace", true, http.MethodPut, base + "/" + projectID, `{"name":"b"}`, http.StatusOK},
		{"replace missing", false, http.MethodPut, base + "/" + projectID, `{"name":"b"}`, http.StatusNotFound},
		{"replace whitespace name", true, http.MethodPut, base + "/" + projectID, `{"name":" "}`, http.StatusUnprocessableEntity},
		{"update", true, http.MethodPatch, base + "/" + projectID, `{"name":"c"}`, http.StatusOK},
		{"update whitespace name", true, http.MethodPatch, base + "/" + projectID, `{"name":"\t"}`, http.StatusUnprocessableEntity},
		{"update missing", false, http.MethodPatch, base + "/" + projectID, `{"name":"c"}`, http.StatusNotFound},
		{"delete", true, http.MethodDelete, base + "/" + projectID, "", http.StatusNoContent},
		{"delete missing", false, http.MethodDelete, base + "/" + projectID, "", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := httpapi.New(newFakeProjects(tc.found), manager)
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", bearer)
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != tc.code {
				t.Fatalf("status = %d, want %d: %s", rr.Code, tc.code, rr.Body.String())
			}
		})
	}
}

func TestTaraProjectDeleteWithItemDefinitions(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	store := newFakeProjects(true)
	store.deleteErr = &pgconn.PgError{Code: "23503"}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/projects/"+projectID, http.NoBody)
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	httpapi.New(store, manager).ServeHTTP(rr, req)
	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d: %s", rr.Code, http.StatusConflict, rr.Body.String())
	}
}

func TestTaraProjectListBody(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", http.NoBody)
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	httpapi.New(newFakeProjects(false), manager).ServeHTTP(rr, req)
	var got []any
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil || got == nil || len(got) != 0 {
		t.Fatalf("body = %s, want []", rr.Body.String())
	}
}

func TestTaraProjectPatchDescription(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	for _, tc := range []struct {
		name string
		body string
		want any
	}{
		{"omitted keeps description", `{"name":"c"}`, "desc"},
		{"null clears description", `{"description":null}`, nil},
		{"value replaces description", `{"description":"new"}`, "new"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPatch, "/api/v1/projects/"+projectID, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", bearer)
			rr := httptest.NewRecorder()
			httpapi.New(newFakeProjects(true), manager).ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
			}
			var got map[string]any
			if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got["description"] != tc.want {
				t.Fatalf("description = %v, want %v: %s", got["description"], tc.want, rr.Body.String())
			}
		})
	}
}

// testUUIDValue parses a fixed test UUID.
func testUUIDValue(t *testing.T, s string) pgtype.UUID {
	t.Helper()
	var id pgtype.UUID
	if err := id.Scan(s); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestTaraProjectRolePermissions(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	path := "/api/v1/projects/" + projectID
	for _, tc := range []struct {
		role   db.ProjectRole
		method string
		body   string
		code   int
	}{
		{"", http.MethodGet, "", http.StatusNotFound},
		{"", http.MethodDelete, "", http.StatusNotFound},
		{db.ProjectRoleVIEWER, http.MethodGet, "", http.StatusOK},
		{db.ProjectRoleVIEWER, http.MethodPatch, `{"name":"x"}`, http.StatusForbidden},
		{db.ProjectRoleEDITOR, http.MethodGet, "", http.StatusOK},
		{db.ProjectRoleEDITOR, http.MethodPut, `{"name":"x"}`, http.StatusForbidden},
		{db.ProjectRoleEDITOR, http.MethodDelete, "", http.StatusForbidden},
		{db.ProjectRoleOWNER, http.MethodPatch, `{"name":"x"}`, http.StatusOK},
		{db.ProjectRoleOWNER, http.MethodDelete, "", http.StatusNoContent},
	} {
		t.Run(string(tc.role)+" "+tc.method, func(t *testing.T) {
			store := newFakeProjects(true)
			store.role = tc.role
			req := httptest.NewRequest(tc.method, path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", bearer)
			rr := httptest.NewRecorder()
			httpapi.New(store, manager).ServeHTTP(rr, req)
			if rr.Code != tc.code {
				t.Fatalf("status = %d, want %d: %s", rr.Code, tc.code, rr.Body.String())
			}
			if store.roleQuery.ProjectID != testUUIDValue(t, projectID) || store.roleQuery.UserID != testUUIDValue(t, authtest.UserID) {
				t.Fatalf("role lookup used %+v", store.roleQuery)
			}
			if tc.code == http.StatusOK {
				var got handlers.TaraProjectBody
				if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil || got.Role != tc.role {
					t.Fatalf("role = %q, want %q (%v)", got.Role, tc.role, err)
				}
			}
		})
	}
}

func TestTaraProjectCreateMakesCallerOwner(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	store := newFakeProjects(true)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", strings.NewReader(`{"name":"a"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	httpapi.New(store, manager).ServeHTTP(rr, req)
	var got handlers.TaraProjectBody
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil || rr.Code != http.StatusCreated || got.Role != db.ProjectRoleOWNER {
		t.Fatalf("create: %d %s", rr.Code, rr.Body.String())
	}
	if store.createdFor != testUUIDValue(t, authtest.UserID) {
		t.Fatalf("owner = %v, want caller %s", store.createdFor, authtest.UserID)
	}
}

func TestTaraProjectListUsesCallerAndGroups(t *testing.T) {
	fixture := authtest.NewFixture(t, nil)
	groups := []any{"7a1e6f4e-1111-4b8a-9c1d-000000000001"}
	store := newFakeProjects(true)
	store.role = db.ProjectRoleEDITOR
	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", http.NoBody)
	req.Header.Set("Authorization", "Bearer "+fixture.Token(t, map[string]any{"taramisu_groups": groups}))
	rr := httptest.NewRecorder()
	httpapi.New(store, fixture.Manager).ServeHTTP(rr, req)
	var got []handlers.TaraProjectBody
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil || len(got) != 1 || got[0].Role != db.ProjectRoleEDITOR {
		t.Fatalf("list: %d %s", rr.Code, rr.Body.String())
	}
	if store.listQuery.UserID != testUUIDValue(t, authtest.UserID) || len(store.listQuery.GroupIds) != 1 || store.listQuery.GroupIds[0] != groups[0] {
		t.Fatalf("list query = %+v", store.listQuery)
	}
}

// TestTaraProjectDeletePassesTheCaller checks that the deletion hands the caller to the store, which
// records it in the audit history (covered against PostgreSQL in TestAuditHistoryPostgres).
func TestTaraProjectDeletePassesTheCaller(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	store := newFakeProjects(true)
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/projects/"+projectID, http.NoBody)
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	httpapi.New(store, manager).ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent || store.deletedBy.UserID != testUUIDValue(t, authtest.UserID) {
		t.Fatalf("delete: %d, actor %v; want 204 by %s", rr.Code, store.deletedBy.UserID, authtest.UserID)
	}
}

// TestTaraProjectChangesAreAudited checks which change each operation hands to the store; the stored
// events are covered against PostgreSQL in TestAuditContentPostgres.
func TestTaraProjectChangesAreAudited(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	store := newFakeProjects(true)
	h := httpapi.New(store, manager)
	for _, c := range []struct {
		method, path, body string
		want               int
	}{
		{http.MethodPost, "/api/v1/projects", `{"name":"new"}`, http.StatusCreated},
		{http.MethodPatch, "/api/v1/projects/" + projectID, `{"name":"proj"}`, http.StatusOK}, // unchanged
		{http.MethodPatch, "/api/v1/projects/" + projectID, `{"name":"renamed"}`, http.StatusOK},
		{http.MethodPut, "/api/v1/projects/" + projectID, `{"name":"proj","description":"other"}`, http.StatusOK},
	} {
		req := httptest.NewRequest(c.method, c.path, strings.NewReader(c.body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", bearer)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != c.want {
			t.Fatalf("%s %s: %d, want %d: %s", c.method, c.path, rr.Code, c.want, rr.Body.String())
		}
	}
	got := store.audit.changes
	want := []string{"project.created", "project.updated", "project.updated"}
	if len(got) != len(want) {
		t.Fatalf("changes = %+v, want %v", got, want)
	}
	for i, event := range want {
		if got[i].Event != event {
			t.Errorf("change %d = %s, want %s", i, got[i].Event, event)
		}
	}
	if got[0].After == nil || got[1].Before == nil || got[2].After == nil {
		t.Errorf("changes = %+v, want after for created and before/after for updated", got)
	}
	for _, actor := range store.audit.actors {
		if actor.UserID != testUUIDValue(t, authtest.UserID) {
			t.Errorf("actor = %v, want the caller %s", actor.UserID, authtest.UserID)
		}
	}
}
