package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const (
	itemDefID    = "22222222-2222-2222-2222-222222222222"
	attackPathID = "33333333-3333-3333-3333-333333333333"
	attackPaths  = "/api/v1/item-definitions/" + itemDefID + "/attack-paths"
	ratingPath   = attackPaths + "/" + attackPathID + "/feasibility-rating"
	linksPath    = "/api/v1/item-definitions/" + itemDefID + "/threat-attack-path-links"
)

func attackUUID(s string) pgtype.UUID {
	var id pgtype.UUID
	_ = id.Scan(s)
	return id
}

// fakeAttackAccess answers the project access checks: the caller holds role in the project.
// An empty role means the caller is not a member.
type fakeAttackAccess struct {
	handlers.ProjectMemberStore
	handlers.ItemDefinitionStore
	handlers.RiskValueStore
	handlers.RiskTreatmentDecisionStore
	handlers.DamageScenarioStore
	handlers.ImpactRatingStore
	handlers.ThreatDamageLinkStore
	role db.ProjectRole
}

func editor() fakeAttackAccess { return fakeAttackAccess{role: db.ProjectRoleEDITOR} }

func (f fakeAttackAccess) GetProjectRole(context.Context, db.GetProjectRoleParams) (db.ProjectRole, error) {
	if f.role == "" {
		return "", pgx.ErrNoRows
	}
	return f.role, nil
}
func (fakeAttackAccess) ProjectIDForItemDefinition(context.Context, pgtype.UUID) (pgtype.UUID, error) {
	return attackUUID("77777777-7777-7777-7777-777777777777"), nil
}
func (fakeAttackAccess) ProjectIDForThreatScenario(context.Context, pgtype.UUID) (pgtype.UUID, error) {
	return attackUUID("77777777-7777-7777-7777-777777777777"), nil
}

type fakeAttackPaths struct {
	fakeAttackAccess
	handlers.TaraProjectStore
	handlers.AttackFeasibilityRatingStore
	handlers.ThreatAttackPathLinkStore
	statusReaderFunc
	found  bool
	update db.UpdateAttackPathParams
}

func (f *fakeAttackPaths) path() db.AttackPath {
	return db.AttackPath{
		ID: attackUUID(attackPathID), ItemDefinitionID: attackUUID(itemDefID),
		Title: "AP", IsPartialEarlyStage: true,
	}
}

func (f *fakeAttackPaths) CreateAttackPath(context.Context, db.CreateAttackPathParams) (db.AttackPath, error) {
	return f.path(), nil
}
func (f *fakeAttackPaths) GetAttackPath(context.Context, db.GetAttackPathParams) (db.AttackPath, error) {
	if !f.found {
		return db.AttackPath{}, pgx.ErrNoRows
	}
	return f.path(), nil
}
func (f *fakeAttackPaths) ListAttackPaths(context.Context, db.ListAttackPathsParams) ([]db.AttackPath, error) {
	return []db.AttackPath{f.path()}, nil
}
func (f *fakeAttackPaths) ReplaceAttackPath(context.Context, db.ReplaceAttackPathParams) (db.AttackPath, error) {
	if !f.found {
		return db.AttackPath{}, pgx.ErrNoRows
	}
	return f.path(), nil
}
func (f *fakeAttackPaths) UpdateAttackPath(_ context.Context, p db.UpdateAttackPathParams) (db.AttackPath, error) {
	f.update = p
	if !f.found {
		return db.AttackPath{}, pgx.ErrNoRows
	}
	return f.path(), nil
}
func (f *fakeAttackPaths) DeleteAttackPath(context.Context, db.DeleteAttackPathParams) (int64, error) {
	if !f.found {
		return 0, nil
	}
	return 1, nil
}

type fakeRatings struct {
	fakeAttackAccess
	handlers.TaraProjectStore
	handlers.AttackPathStore
	handlers.ThreatAttackPathLinkStore
	statusReaderFunc
	belongs, found bool
	writeErr       error
	update         db.UpdateAttackFeasibilityRatingParams
}

func (f *fakeRatings) rating() db.AttackFeasibilityRating {
	high := db.AttackFeasibilityHIGH
	return db.AttackFeasibilityRating{
		ID: attackUUID(attackPathID), AttackPathID: attackUUID(attackPathID),
		FeasibilityRating: &high,
	}
}

func (f *fakeRatings) AttackPathBelongsToItem(context.Context, db.AttackPathBelongsToItemParams) (bool, error) {
	return f.belongs, nil
}
func (f *fakeRatings) GetAttackFeasibilityRating(context.Context, pgtype.UUID) (db.AttackFeasibilityRating, error) {
	if !f.found {
		return db.AttackFeasibilityRating{}, pgx.ErrNoRows
	}
	return f.rating(), nil
}
func (f *fakeRatings) UpsertAttackFeasibilityRating(context.Context, db.UpsertAttackFeasibilityRatingParams) (db.AttackFeasibilityRating, error) {
	if f.writeErr != nil {
		return db.AttackFeasibilityRating{}, f.writeErr
	}
	return f.rating(), nil
}
func (f *fakeRatings) UpdateAttackFeasibilityRating(_ context.Context, p db.UpdateAttackFeasibilityRatingParams) (db.AttackFeasibilityRating, error) {
	f.update = p
	if !f.found {
		return db.AttackFeasibilityRating{}, pgx.ErrNoRows
	}
	return f.rating(), nil
}
func (f *fakeRatings) DeleteAttackFeasibilityRating(context.Context, pgtype.UUID) (int64, error) {
	if !f.found {
		return 0, nil
	}
	return 1, nil
}

type fakeLinks struct {
	fakeAttackAccess
	handlers.TaraProjectStore
	handlers.AttackPathStore
	handlers.AttackFeasibilityRatingStore
	statusReaderFunc
	mode string
}

func (f *fakeLinks) link() db.ThreatAttackPathLink {
	return db.ThreatAttackPathLink{
		ID: attackUUID(attackPathID), ThreatScenarioID: attackUUID(itemDefID), AttackPathID: attackUUID(attackPathID),
	}
}

func (f *fakeLinks) CreateThreatAttackPathLink(context.Context, db.CreateThreatAttackPathLinkParams) (db.ThreatAttackPathLink, error) {
	switch f.mode {
	case "noparent":
		return db.ThreatAttackPathLink{}, pgx.ErrNoRows
	case "dup":
		return db.ThreatAttackPathLink{}, &pgconn.PgError{Code: "23505"}
	}
	return f.link(), nil
}
func (f *fakeLinks) ListThreatAttackPathLinks(context.Context, db.ListThreatAttackPathLinksParams) ([]db.ThreatAttackPathLink, error) {
	return []db.ThreatAttackPathLink{f.link()}, nil
}
func (f *fakeLinks) DeleteThreatAttackPathLink(context.Context, db.DeleteThreatAttackPathLinkParams) (int64, error) {
	if f.mode == "missing" {
		return 0, nil
	}
	return 1, nil
}

func TestAttackPathRoutes(t *testing.T) {
	member := attackPaths + "/" + attackPathID
	manager, bearer := authtest.NewManagerAndToken(t)
	for _, tc := range []struct {
		name   string
		found  bool
		method string
		path   string
		body   string
		code   int
	}{
		{"create", true, http.MethodPost, attackPaths, `{"title":"AP"}`, http.StatusCreated},
		{"create empty title", true, http.MethodPost, attackPaths, `{"title":""}`, http.StatusUnprocessableEntity},
		{"create bad approach", true, http.MethodPost, attackPaths, `{"title":"AP","analysis_approach":"SIDEWAYS"}`, http.StatusUnprocessableEntity},
		{"create with steps", true, http.MethodPost, attackPaths, `{"title":"AP","attack_steps_and_weaknesses":{"a":[1,2]}}`, http.StatusCreated},
		{"list", true, http.MethodGet, attackPaths, "", http.StatusOK},
		{"list paged", true, http.MethodGet, attackPaths + "?limit=100&offset=2147483647", "", http.StatusOK},
		{"list limit too large", true, http.MethodGet, attackPaths + "?limit=101", "", http.StatusUnprocessableEntity},
		{"list negative offset", true, http.MethodGet, attackPaths + "?offset=-1", "", http.StatusUnprocessableEntity},
		{"get", true, http.MethodGet, member, "", http.StatusOK},
		{"get missing", false, http.MethodGet, member, "", http.StatusNotFound},
		{"get bad item id", true, http.MethodGet, "/api/v1/item-definitions/nope/attack-paths", "", http.StatusUnprocessableEntity},
		{"get bad id", true, http.MethodGet, attackPaths + "/nope", "", http.StatusUnprocessableEntity},
		{"replace", true, http.MethodPut, member, `{"title":"B"}`, http.StatusOK},
		{"replace missing", false, http.MethodPut, member, `{"title":"B"}`, http.StatusNotFound},
		{"update", true, http.MethodPatch, member, `{"is_partial_early_stage":false}`, http.StatusOK},
		{"update missing", false, http.MethodPatch, member, `{"title":"C"}`, http.StatusNotFound},
		{"delete", true, http.MethodDelete, member, "", http.StatusNoContent},
		{"delete missing", false, http.MethodDelete, member, "", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := httpapi.New(&fakeAttackPaths{fakeAttackAccess: editor(), found: tc.found}, manager)
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

func TestAttackFeasibilityRatingRoutes(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	for _, tc := range []struct {
		name    string
		belongs bool
		found   bool
		method  string
		body    string
		code    int
	}{
		{"get", true, true, http.MethodGet, "", http.StatusOK},
		{"get missing", true, false, http.MethodGet, "", http.StatusNotFound},
		{"get path not in item", false, true, http.MethodGet, "", http.StatusNotFound},
		{"replace", true, true, http.MethodPut, `{"ap_total_score":7,"feasibility_rating":"HIGH","rationale":"why"}`, http.StatusOK},
		{"replace bad rating", true, true, http.MethodPut, `{"feasibility_rating":"EXTREME"}`, http.StatusUnprocessableEntity},
		{"replace negative score", true, true, http.MethodPut, `{"ap_equipment":-1}`, http.StatusUnprocessableEntity},
		{"replace path not in item", false, true, http.MethodPut, `{}`, http.StatusNotFound},
		{"update", true, true, http.MethodPatch, `{"rationale":"new"}`, http.StatusOK},
		{"update missing", true, false, http.MethodPatch, `{"rationale":"new"}`, http.StatusNotFound},
		{"delete", true, true, http.MethodDelete, "", http.StatusNoContent},
		{"delete missing", true, false, http.MethodDelete, "", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := httpapi.New(&fakeRatings{fakeAttackAccess: editor(), belongs: tc.belongs, found: tc.found}, manager)
			req := httptest.NewRequest(tc.method, ratingPath, strings.NewReader(tc.body))
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

func TestThreatAttackPathLinkRoutes(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	const body = `{"threat_scenario_id":"` + itemDefID + `","attack_path_id":"` + attackPathID + `"}`
	for _, tc := range []struct {
		name   string
		mode   string
		method string
		path   string
		body   string
		code   int
	}{
		{"list", "", http.MethodGet, linksPath, "", http.StatusOK},
		{"list paged", "", http.MethodGet, linksPath + "?limit=1&offset=0", "", http.StatusOK},
		{"list limit too small", "", http.MethodGet, linksPath + "?limit=0", "", http.StatusUnprocessableEntity},
		{"create", "", http.MethodPost, linksPath, body, http.StatusCreated},
		{"create missing parent", "noparent", http.MethodPost, linksPath, body, http.StatusUnprocessableEntity},
		{"create duplicate", "dup", http.MethodPost, linksPath, body, http.StatusConflict},
		{"create bad uuid", "", http.MethodPost, linksPath, `{"threat_scenario_id":"nope","attack_path_id":"` + attackPathID + `"}`, http.StatusUnprocessableEntity},
		{"delete", "", http.MethodDelete, linksPath + "/" + attackPathID, "", http.StatusNoContent},
		{"delete missing", "missing", http.MethodDelete, linksPath + "/" + attackPathID, "", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := httpapi.New(&fakeLinks{fakeAttackAccess: editor(), mode: tc.mode}, manager)
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

func TestAttackPathRoutesRequireAuthentication(t *testing.T) {
	manager, _ := authtest.NewManagerAndToken(t)
	h := httpapi.New(&fakeAttackPaths{fakeAttackAccess: editor(), found: true}, manager)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, attackPaths, http.NoBody))
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAttackFeasibilityRatingCheckViolationIs422(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	h := httpapi.New(&fakeRatings{fakeAttackAccess: editor(), belongs: true, found: true, writeErr: &pgconn.PgError{Code: "23514"}}, manager)
	req := httptest.NewRequest(http.MethodPut, ratingPath, strings.NewReader(`{"ap_total_score":7}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d: %s", rr.Code, http.StatusUnprocessableEntity, rr.Body.String())
	}
}

func attackRequest(h http.Handler, bearer, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestAttackPathRoutesProjectRoles(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	member := attackPaths + "/" + attackPathID
	const link = `{"threat_scenario_id":"` + itemDefID + `","attack_path_id":"` + attackPathID + `"}`
	for _, tc := range []struct {
		name, method, path, body string
		write                    bool
	}{
		{"list attack paths", http.MethodGet, attackPaths, "", false},
		{"create attack path", http.MethodPost, attackPaths, `{"title":"AP"}`, true},
		{"get attack path", http.MethodGet, member, "", false},
		{"replace attack path", http.MethodPut, member, `{"title":"B"}`, true},
		{"update attack path", http.MethodPatch, member, `{"title":"C"}`, true},
		{"delete attack path", http.MethodDelete, member, "", true},
		{"get rating", http.MethodGet, ratingPath, "", false},
		{"replace rating", http.MethodPut, ratingPath, `{"rationale":"r"}`, true},
		{"update rating", http.MethodPatch, ratingPath, `{"rationale":"r"}`, true},
		{"delete rating", http.MethodDelete, ratingPath, "", true},
		{"list links", http.MethodGet, linksPath, "", false},
		{"create link", http.MethodPost, linksPath, link, true},
		{"delete link", http.MethodDelete, linksPath + "/" + attackPathID, "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			status := func(role db.ProjectRole) int {
				access := fakeAttackAccess{role: role}
				var store httpapi.Queries = &fakeAttackPaths{fakeAttackAccess: access, found: true}
				switch {
				case tc.path == ratingPath:
					store = &fakeRatings{fakeAttackAccess: access, belongs: true, found: true}
				case strings.HasPrefix(tc.path, linksPath):
					store = &fakeLinks{fakeAttackAccess: access}
				}
				return attackRequest(httpapi.New(store, manager), bearer, tc.method, tc.path, tc.body).Code
			}
			if got := status(""); got != http.StatusNotFound {
				t.Fatalf("non-member: status = %d, want 404", got)
			}
			viewer := status(db.ProjectRoleVIEWER)
			if tc.write && viewer != http.StatusForbidden {
				t.Fatalf("viewer: status = %d, want 403", viewer)
			}
			if !tc.write && viewer >= 400 {
				t.Fatalf("viewer: status = %d, want success", viewer)
			}
			if got := status(db.ProjectRoleEDITOR); got >= 400 {
				t.Fatalf("editor: status = %d, want success", got)
			}
		})
	}
}

func TestAttackCreateSetsLocation(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	const link = `{"threat_scenario_id":"` + itemDefID + `","attack_path_id":"` + attackPathID + `"}`
	for _, tc := range []struct {
		store      httpapi.Queries
		path, body string
	}{
		{&fakeAttackPaths{fakeAttackAccess: editor(), found: true}, attackPaths, `{"title":"AP"}`},
		{&fakeLinks{fakeAttackAccess: editor()}, linksPath, link},
	} {
		rr := attackRequest(httpapi.New(tc.store, manager), bearer, http.MethodPost, tc.path, tc.body)
		if want := tc.path + "/" + attackPathID; rr.Code != http.StatusCreated || rr.Header().Get("Location") != want {
			t.Fatalf("POST %s: status = %d, Location = %q, want %q", tc.path, rr.Code, rr.Header().Get("Location"), want)
		}
	}
}

func TestAttackPatchDistinguishesOmittedFromNull(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)

	paths := &fakeAttackPaths{fakeAttackAccess: editor(), found: true}
	h := httpapi.New(paths, manager)
	if rr := attackRequest(h, bearer, http.MethodPatch, attackPaths+"/"+attackPathID, `{"title":"x"}`); rr.Code != http.StatusOK {
		t.Fatal(rr.Body.String())
	}
	if paths.update.SetAnalysisApproach || paths.update.SetAttackStepsAndWeaknesses {
		t.Fatalf("omitted fields must stay unchanged: %+v", paths.update)
	}
	if rr := attackRequest(h, bearer, http.MethodPatch, attackPaths+"/"+attackPathID, `{"analysis_approach":null,"attack_steps_and_weaknesses":null}`); rr.Code != http.StatusOK {
		t.Fatal(rr.Body.String())
	}
	if !paths.update.SetAnalysisApproach || paths.update.AnalysisApproach != nil || !paths.update.SetAttackStepsAndWeaknesses || paths.update.AttackStepsAndWeaknesses != nil {
		t.Fatalf("null must clear the fields: %+v", paths.update)
	}
	if rr := attackRequest(h, bearer, http.MethodPatch, attackPaths+"/"+attackPathID, `{"analysis_approach":"TOP_DOWN","attack_steps_and_weaknesses":{"a":1}}`); rr.Code != http.StatusOK {
		t.Fatal(rr.Body.String())
	}
	if !paths.update.SetAnalysisApproach || *paths.update.AnalysisApproach != db.AnalysisApproachTOPDOWN || string(paths.update.AttackStepsAndWeaknesses) != `{"a":1}` {
		t.Fatalf("values must be set: %+v", paths.update)
	}

	ratings := &fakeRatings{fakeAttackAccess: editor(), belongs: true, found: true}
	h = httpapi.New(ratings, manager)
	if rr := attackRequest(h, bearer, http.MethodPatch, ratingPath, `{"rationale":null}`); rr.Code != http.StatusOK {
		t.Fatal(rr.Body.String())
	}
	if !ratings.update.SetRationale || ratings.update.Rationale != nil || ratings.update.SetApTotalScore || ratings.update.SetFeasibilityRating {
		t.Fatalf("only the null field may be cleared: %+v", ratings.update)
	}
}
