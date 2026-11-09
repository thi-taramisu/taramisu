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

func testUUID(s string) pgtype.UUID {
	var id pgtype.UUID
	_ = id.Scan(s)
	return id
}

type fakeAttackPaths struct {
	handlers.TaraProjectStore
	handlers.AttackFeasibilityRatingStore
	handlers.ThreatAttackPathLinkStore
	statusReaderFunc
	found bool
}

func (f *fakeAttackPaths) path() db.AttackPath {
	return db.AttackPath{
		ID: testUUID(attackPathID), ItemDefinitionID: testUUID(itemDefID),
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
func (f *fakeAttackPaths) ListAttackPaths(context.Context, pgtype.UUID) ([]db.AttackPath, error) {
	return []db.AttackPath{f.path()}, nil
}
func (f *fakeAttackPaths) ReplaceAttackPath(context.Context, db.ReplaceAttackPathParams) (db.AttackPath, error) {
	if !f.found {
		return db.AttackPath{}, pgx.ErrNoRows
	}
	return f.path(), nil
}
func (f *fakeAttackPaths) UpdateAttackPath(context.Context, db.UpdateAttackPathParams) (db.AttackPath, error) {
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
	handlers.TaraProjectStore
	handlers.AttackPathStore
	handlers.ThreatAttackPathLinkStore
	statusReaderFunc
	belongs, found bool
	writeErr       error
}

func (f *fakeRatings) rating() db.AttackFeasibilityRating {
	high := db.AttackFeasibilityHIGH
	return db.AttackFeasibilityRating{
		ID: testUUID(attackPathID), AttackPathID: testUUID(attackPathID),
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
func (f *fakeRatings) UpdateAttackFeasibilityRating(context.Context, db.UpdateAttackFeasibilityRatingParams) (db.AttackFeasibilityRating, error) {
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
	handlers.TaraProjectStore
	handlers.AttackPathStore
	handlers.AttackFeasibilityRatingStore
	statusReaderFunc
	mode string
}

func (f *fakeLinks) link() db.ThreatAttackPathLink {
	return db.ThreatAttackPathLink{
		ID: testUUID(attackPathID), ThreatScenarioID: testUUID(itemDefID), AttackPathID: testUUID(attackPathID),
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
func (f *fakeLinks) ListThreatAttackPathLinks(context.Context, pgtype.UUID) ([]db.ThreatAttackPathLink, error) {
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
			h := httpapi.New(&fakeAttackPaths{found: tc.found}, manager)
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
			h := httpapi.New(&fakeRatings{belongs: tc.belongs, found: tc.found}, manager)
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
		{"create", "", http.MethodPost, linksPath, body, http.StatusCreated},
		{"create missing parent", "noparent", http.MethodPost, linksPath, body, http.StatusUnprocessableEntity},
		{"create duplicate", "dup", http.MethodPost, linksPath, body, http.StatusConflict},
		{"create bad uuid", "", http.MethodPost, linksPath, `{"threat_scenario_id":"nope","attack_path_id":"` + attackPathID + `"}`, http.StatusUnprocessableEntity},
		{"delete", "", http.MethodDelete, linksPath + "/" + attackPathID, "", http.StatusNoContent},
		{"delete missing", "missing", http.MethodDelete, linksPath + "/" + attackPathID, "", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := httpapi.New(&fakeLinks{mode: tc.mode}, manager)
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
	h := httpapi.New(&fakeAttackPaths{found: true}, manager)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, attackPaths, nil))
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAttackFeasibilityRatingCheckViolationIs422(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	h := httpapi.New(&fakeRatings{belongs: true, found: true, writeErr: &pgconn.PgError{Code: "23514"}}, manager)
	req := httptest.NewRequest(http.MethodPut, ratingPath, strings.NewReader(`{"ap_total_score":7}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d: %s", rr.Code, http.StatusUnprocessableEntity, rr.Body.String())
	}
}
