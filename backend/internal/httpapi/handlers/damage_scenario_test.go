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
	dmgItemID     = "33333333-3333-3333-3333-333333333333"
	dmgScenarioID = "44444444-4444-4444-4444-444444444444"
	dmgRatingID   = "55555555-5555-5555-5555-555555555555"
	dmgThreatID   = "66666666-6666-6666-6666-666666666666"

	dmgScenarios = "/api/v1/item-definitions/" + dmgItemID + "/damage-scenarios"
	dmgRatings   = dmgScenarios + "/" + dmgScenarioID + "/impact-ratings"
	dmgLinks     = "/api/v1/item-definitions/" + dmgItemID + "/threat-damage-links"
)

func dmgUUID(s string) pgtype.UUID {
	var id pgtype.UUID
	_ = id.Scan(s)
	return id
}

// fakeDamage implements the damage scenario, impact rating and link stores. found controls whether
// lookups succeed; err is returned by every write that reaches the database.
type fakeDamage struct {
	handlers.AssetStore
	handlers.AssetCybersecurityPropertyStore
	handlers.DamagePropertyLinkStore
	handlers.ThreatPropertyLinkStore

	handlers.TaraProjectStore
	handlers.ProjectMemberStore
	handlers.ItemDefinitionStore
	handlers.RiskValueStore
	handlers.RiskTreatmentDecisionStore
	handlers.AttackPathStore
	handlers.AttackFeasibilityRatingStore
	handlers.ThreatAttackPathLinkStore
	statusReaderFunc
	found bool
	err   error
	role  db.ProjectRole // caller's project role; empty means not a member
}

func (f *fakeDamage) GetProjectRole(context.Context, db.GetProjectRoleParams) (db.ProjectRole, error) {
	if f.role == "" {
		return "", pgx.ErrNoRows
	}
	return f.role, nil
}
func (f *fakeDamage) ProjectIDForItemDefinition(context.Context, pgtype.UUID) (pgtype.UUID, error) {
	return dmgUUID("77777777-7777-7777-7777-777777777777"), nil
}
func (f *fakeDamage) ProjectIDForThreatScenario(context.Context, pgtype.UUID) (pgtype.UUID, error) {
	return dmgUUID("77777777-7777-7777-7777-777777777777"), nil
}

func (f *fakeDamage) scenario() db.DamageScenario {
	text := "text"
	return db.DamageScenario{ID: dmgUUID(dmgScenarioID), ItemDefinitionID: dmgUUID(dmgItemID), Title: "Brake loss", RoadUserHarmDescription: &text}
}

func (f *fakeDamage) rating() db.ImpactRating {
	severe := db.ImpactRatingValueSEVERE
	return db.ImpactRating{ID: dmgUUID(dmgRatingID), DamageScenarioID: dmgUUID(dmgScenarioID), ImpactCategory: db.ImpactCategorySAFETY, RatingValue: &severe}
}

func (f *fakeDamage) lookup() error {
	if !f.found {
		return pgx.ErrNoRows
	}
	return nil
}

func (f *fakeDamage) CreateDamageScenario(context.Context, db.CreateDamageScenarioParams) (db.DamageScenario, error) {
	if f.err != nil {
		return db.DamageScenario{}, f.err
	}
	return f.scenario(), f.lookup()
}
func (f *fakeDamage) GetDamageScenario(context.Context, db.GetDamageScenarioParams) (db.DamageScenario, error) {
	return f.scenario(), f.lookup()
}
func (f *fakeDamage) ListDamageScenarios(context.Context, db.ListDamageScenariosParams) ([]db.DamageScenario, error) {
	return []db.DamageScenario{f.scenario()}, nil
}
func (f *fakeDamage) ReplaceDamageScenario(context.Context, db.ReplaceDamageScenarioParams) (db.DamageScenario, error) {
	return f.scenario(), f.lookup()
}
func (f *fakeDamage) UpdateDamageScenario(context.Context, db.UpdateDamageScenarioParams) (db.DamageScenario, error) {
	return f.scenario(), f.lookup()
}
func (f *fakeDamage) DeleteDamageScenario(context.Context, db.DeleteDamageScenarioParams) (int64, error) {
	if !f.found {
		return 0, nil
	}
	return 1, nil
}

func (f *fakeDamage) CreateImpactRating(context.Context, db.CreateImpactRatingParams) (db.ImpactRating, error) {
	if f.err != nil {
		return db.ImpactRating{}, f.err
	}
	return f.rating(), f.lookup()
}
func (f *fakeDamage) GetImpactRating(context.Context, db.GetImpactRatingParams) (db.ImpactRating, error) {
	return f.rating(), f.lookup()
}
func (f *fakeDamage) ListImpactRatings(context.Context, db.ListImpactRatingsParams) ([]db.ImpactRating, error) {
	return []db.ImpactRating{f.rating()}, nil
}
func (f *fakeDamage) ReplaceImpactRating(context.Context, db.ReplaceImpactRatingParams) (db.ImpactRating, error) {
	if f.err != nil {
		return db.ImpactRating{}, f.err
	}
	return f.rating(), f.lookup()
}
func (f *fakeDamage) UpdateImpactRating(context.Context, db.UpdateImpactRatingParams) (db.ImpactRating, error) {
	if f.err != nil {
		return db.ImpactRating{}, f.err
	}
	return f.rating(), f.lookup()
}
func (f *fakeDamage) DeleteImpactRating(context.Context, db.DeleteImpactRatingParams) (int64, error) {
	if !f.found {
		return 0, nil
	}
	return 1, nil
}

func (f *fakeDamage) CreateThreatDamageLink(context.Context, db.CreateThreatDamageLinkParams) (db.ThreatDamageLink, error) {
	if f.err != nil {
		return db.ThreatDamageLink{}, f.err
	}
	return db.ThreatDamageLink{ID: dmgUUID(dmgRatingID), ThreatScenarioID: dmgUUID(dmgThreatID), DamageScenarioID: dmgUUID(dmgScenarioID)}, f.lookup()
}
func (f *fakeDamage) ListThreatDamageLinks(context.Context, db.ListThreatDamageLinksParams) ([]db.ThreatDamageLink, error) {
	return []db.ThreatDamageLink{{ID: dmgUUID(dmgRatingID), ThreatScenarioID: dmgUUID(dmgThreatID), DamageScenarioID: dmgUUID(dmgScenarioID)}}, nil
}
func (f *fakeDamage) DeleteThreatDamageLink(context.Context, db.DeleteThreatDamageLinkParams) (int64, error) {
	if !f.found {
		return 0, nil
	}
	return 1, nil
}

func TestDamageRoutes(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	scenario := dmgScenarios + "/" + dmgScenarioID
	rating := dmgRatings + "/" + dmgRatingID
	linkBody := `{"threat_scenario_id":"` + dmgThreatID + `","damage_scenario_id":"` + dmgScenarioID + `"}`
	pgCode := func(code string) error { return &pgconn.PgError{Code: code} }
	for _, tc := range []struct {
		name   string
		found  bool
		err    error
		method string
		path   string
		body   string
		code   int
	}{
		{"create scenario", true, nil, http.MethodPost, dmgScenarios, `{"title":"Brake loss"}`, http.StatusCreated},
		{"create scenario unknown item", false, nil, http.MethodPost, dmgScenarios, `{"title":"x"}`, http.StatusNotFound},
		{"create scenario blank title", true, nil, http.MethodPost, dmgScenarios, `{"title":"  "}`, http.StatusUnprocessableEntity},
		{"create scenario missing title", true, nil, http.MethodPost, dmgScenarios, `{}`, http.StatusUnprocessableEntity},
		{"create scenario bad item id", true, nil, http.MethodPost, "/api/v1/item-definitions/nope/damage-scenarios", `{"title":"x"}`, http.StatusUnprocessableEntity},
		{"list scenarios", true, nil, http.MethodGet, dmgScenarios, "", http.StatusOK},
		{"list scenarios paged", true, nil, http.MethodGet, dmgScenarios + "?limit=100&offset=2147483647", "", http.StatusOK},
		{"list scenarios limit too small", true, nil, http.MethodGet, dmgScenarios + "?limit=0", "", http.StatusUnprocessableEntity},
		{"list scenarios limit too large", true, nil, http.MethodGet, dmgScenarios + "?limit=101", "", http.StatusUnprocessableEntity},
		{"list scenarios negative offset", true, nil, http.MethodGet, dmgScenarios + "?offset=-1", "", http.StatusUnprocessableEntity},
		{"list scenarios offset too large", true, nil, http.MethodGet, dmgScenarios + "?offset=2147483648", "", http.StatusUnprocessableEntity},
		{"get scenario", true, nil, http.MethodGet, scenario, "", http.StatusOK},
		{"get scenario missing", false, nil, http.MethodGet, scenario, "", http.StatusNotFound},
		{"get scenario bad id", true, nil, http.MethodGet, dmgScenarios + "/nope", "", http.StatusUnprocessableEntity},
		{"replace scenario", true, nil, http.MethodPut, scenario, `{"title":"B"}`, http.StatusOK},
		{"replace scenario missing", false, nil, http.MethodPut, scenario, `{"title":"B"}`, http.StatusNotFound},
		{"update scenario", true, nil, http.MethodPatch, scenario, `{"road_user_harm_description":null}`, http.StatusOK},
		{"update scenario missing", false, nil, http.MethodPatch, scenario, `{"title":"C"}`, http.StatusNotFound},
		{"update scenario blank title", true, nil, http.MethodPatch, scenario, `{"title":""}`, http.StatusUnprocessableEntity},
		{"delete scenario", true, nil, http.MethodDelete, scenario, "", http.StatusNoContent},
		{"delete scenario missing", false, nil, http.MethodDelete, scenario, "", http.StatusNotFound},

		{"create rating", true, nil, http.MethodPost, dmgRatings, `{"impact_category":"SAFETY","rating_value":"SEVERE"}`, http.StatusCreated},
		{"create rating unknown scenario", false, nil, http.MethodPost, dmgRatings, `{"impact_category":"SAFETY"}`, http.StatusNotFound},
		{"create rating bad category", true, nil, http.MethodPost, dmgRatings, `{"impact_category":"SPEED"}`, http.StatusUnprocessableEntity},
		{"create rating bad value", true, nil, http.MethodPost, dmgRatings, `{"impact_category":"SAFETY","rating_value":"HUGE"}`, http.StatusUnprocessableEntity},
		{"create rating duplicate category", true, pgCode("23505"), http.MethodPost, dmgRatings, `{"impact_category":"SAFETY"}`, http.StatusConflict},
		{"create rating inconsistent omission", true, pgCode("23514"), http.MethodPost, dmgRatings, `{"impact_category":"SAFETY","rating_value":"OMITTED"}`, http.StatusUnprocessableEntity},
		{"list ratings", true, nil, http.MethodGet, dmgRatings, "", http.StatusOK},
		{"list ratings paged", true, nil, http.MethodGet, dmgRatings + "?limit=1&offset=0", "", http.StatusOK},
		{"list ratings limit too large", true, nil, http.MethodGet, dmgRatings + "?limit=101", "", http.StatusUnprocessableEntity},
		{"get rating", true, nil, http.MethodGet, rating, "", http.StatusOK},
		{"get rating missing", false, nil, http.MethodGet, rating, "", http.StatusNotFound},
		{"replace rating", true, nil, http.MethodPut, rating, `{"impact_category":"PRIVACY","rating_value":"MAJOR"}`, http.StatusOK},
		{"replace rating missing", false, nil, http.MethodPut, rating, `{"impact_category":"PRIVACY"}`, http.StatusNotFound},
		{"replace rating inconsistent", true, pgCode("23514"), http.MethodPut, rating, `{"impact_category":"PRIVACY","reused_from_functional_safety":true}`, http.StatusUnprocessableEntity},
		{"update rating", true, nil, http.MethodPatch, rating, `{"omission_or_rating_rationale":null,"reused_from_functional_safety":false}`, http.StatusOK},
		{"update rating missing", false, nil, http.MethodPatch, rating, `{"rating_value":"MAJOR"}`, http.StatusNotFound},
		{"update rating duplicate category", true, pgCode("23505"), http.MethodPatch, rating, `{"impact_category":"PRIVACY"}`, http.StatusConflict},
		{"update rating unexpected error", true, pgCode("XX000"), http.MethodPatch, rating, `{"rating_value":"MAJOR"}`, http.StatusInternalServerError},
		{"delete rating", true, nil, http.MethodDelete, rating, "", http.StatusNoContent},
		{"delete rating missing", false, nil, http.MethodDelete, rating, "", http.StatusNotFound},

		{"list links", true, nil, http.MethodGet, dmgLinks, "", http.StatusOK},
		{"list links paged", true, nil, http.MethodGet, dmgLinks + "?limit=1&offset=0", "", http.StatusOK},
		{"list links limit too large", true, nil, http.MethodGet, dmgLinks + "?limit=101", "", http.StatusUnprocessableEntity},
		{"list links negative offset", true, nil, http.MethodGet, dmgLinks + "?offset=-1", "", http.StatusUnprocessableEntity},
		{"create link", true, nil, http.MethodPost, dmgLinks, linkBody, http.StatusCreated},
		{"create link outside item", false, nil, http.MethodPost, dmgLinks, linkBody, http.StatusUnprocessableEntity},
		{"create link duplicate", true, pgCode("23505"), http.MethodPost, dmgLinks, linkBody, http.StatusConflict},
		{"create link bad uuid", true, nil, http.MethodPost, dmgLinks, `{"threat_scenario_id":"nope","damage_scenario_id":"` + dmgScenarioID + `"}`, http.StatusUnprocessableEntity},
		{"delete link", true, nil, http.MethodDelete, dmgLinks + "/" + dmgRatingID, "", http.StatusNoContent},
		{"delete link missing", false, nil, http.MethodDelete, dmgLinks + "/" + dmgRatingID, "", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := httpapi.New(&fakeDamage{found: tc.found, err: tc.err, role: db.ProjectRoleEDITOR}, manager)
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

func TestDamageRoutesProjectRoles(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	scenario := dmgScenarios + "/" + dmgScenarioID
	rating := dmgRatings + "/" + dmgRatingID
	for _, tc := range []struct {
		name, method, path, body string
		write                    bool
	}{
		{"list scenarios", http.MethodGet, dmgScenarios, "", false},
		{"create scenario", http.MethodPost, dmgScenarios, `{"title":"x"}`, true},
		{"get scenario", http.MethodGet, scenario, "", false},
		{"replace scenario", http.MethodPut, scenario, `{"title":"x"}`, true},
		{"update scenario", http.MethodPatch, scenario, `{"title":"x"}`, true},
		{"delete scenario", http.MethodDelete, scenario, "", true},
		{"list ratings", http.MethodGet, dmgRatings, "", false},
		{"create rating", http.MethodPost, dmgRatings, `{"impact_category":"SAFETY"}`, true},
		{"get rating", http.MethodGet, rating, "", false},
		{"replace rating", http.MethodPut, rating, `{"impact_category":"SAFETY"}`, true},
		{"update rating", http.MethodPatch, rating, `{"rating_value":"MAJOR"}`, true},
		{"delete rating", http.MethodDelete, rating, "", true},
		{"list links", http.MethodGet, dmgLinks, "", false},
		{"create link", http.MethodPost, dmgLinks, `{"threat_scenario_id":"` + dmgThreatID + `","damage_scenario_id":"` + dmgScenarioID + `"}`, true},
		{"delete link", http.MethodDelete, dmgLinks + "/" + dmgRatingID, "", true},
	} {
		do := func(role db.ProjectRole) int {
			h := httpapi.New(&fakeDamage{found: true, role: role}, manager)
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", bearer)
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			return rr.Code
		}
		t.Run(tc.name, func(t *testing.T) {
			if got := do(""); got != http.StatusNotFound {
				t.Fatalf("non-member: status = %d, want 404", got)
			}
			viewer := do(db.ProjectRoleVIEWER)
			if tc.write && viewer != http.StatusForbidden {
				t.Fatalf("viewer: status = %d, want 403", viewer)
			}
			if !tc.write && viewer >= 400 {
				t.Fatalf("viewer: status = %d, want success", viewer)
			}
			if got := do(db.ProjectRoleEDITOR); got >= 400 {
				t.Fatalf("editor: status = %d, want success", got)
			}
		})
	}
}

func TestDamageCreateSetsLocation(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	h := httpapi.New(&fakeDamage{found: true, role: db.ProjectRoleEDITOR}, manager)
	for _, tc := range []struct{ path, body, want string }{
		{dmgScenarios, `{"title":"x"}`, dmgScenarios + "/" + dmgScenarioID},
		{dmgRatings, `{"impact_category":"SAFETY"}`, dmgRatings + "/" + dmgRatingID},
	} {
		req := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", bearer)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusCreated || rr.Header().Get("Location") != tc.want {
			t.Fatalf("POST %s: status = %d, Location = %q, want %q", tc.path, rr.Code, rr.Header().Get("Location"), tc.want)
		}
	}
}

func TestDamageRoutesRequireAuthentication(t *testing.T) {
	manager, _ := authtest.NewManagerAndToken(t)
	h := httpapi.New(&fakeDamage{found: true, role: db.ProjectRoleEDITOR}, manager)
	for _, path := range []string{dmgScenarios, dmgRatings, dmgLinks} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, path, http.NoBody))
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("GET %s: status = %d, want %d", path, rr.Code, http.StatusUnauthorized)
		}
	}
}
