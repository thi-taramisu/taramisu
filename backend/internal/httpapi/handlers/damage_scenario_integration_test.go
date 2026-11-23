package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

func TestDamageScenarioPostgresLifecycle(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := tx.Rollback(ctx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
			t.Error(err)
		}
	}()

	var projectID, itemID, otherItemID, threatID string
	seed := func(dst *string, sql string, args ...any) {
		t.Helper()
		if err := tx.QueryRow(ctx, sql, args...).Scan(dst); err != nil {
			t.Fatal(err)
		}
	}
	seed(&projectID, `INSERT INTO tara_project (name) VALUES ('p') RETURNING id::text`)
	seed(&itemID, `INSERT INTO item_definition (tara_project_id, name, scope_type) VALUES ($1, 'a', 'ITEM') RETURNING id::text`, projectID)
	seed(&otherItemID, `INSERT INTO item_definition (tara_project_id, name, scope_type) VALUES ($1, 'b', 'ITEM') RETURNING id::text`, projectID)
	seed(&threatID, `INSERT INTO threat_scenario (item_definition_id, title) VALUES ($1, 't') RETURNING id::text`, itemID)

	fixture := authtest.NewFixture(t, db.New(tx))
	manager, bearer := fixture.Manager, "Bearer "+fixture.Token(t, nil)
	userID, err := db.New(tx).UpsertIAMUser(ctx, authtest.Subject)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_role_assignment (tara_project_id, user_id, project_role) VALUES ($1, $2, 'EDITOR')`, projectID, userID); err != nil {
		t.Fatal(err)
	}
	do := func(q db.TxStarter, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", bearer)
		rr := httptest.NewRecorder()
		httpapi.New(db.NewStore(q), manager).ServeHTTP(rr, req)
		return rr
	}
	call := func(method, path, body string, want int, out any) {
		t.Helper()
		rr := do(tx, method, path, body)
		if rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		if out != nil {
			if err := json.Unmarshal(rr.Body.Bytes(), out); err != nil {
				t.Fatal(err)
			}
		}
	}
	// A failed statement aborts the transaction, so requests expected to hit a database error run in a savepoint.
	callFailing := func(method, path, body string, want int) {
		t.Helper()
		sp, err := tx.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer func() {
			if err := sp.Rollback(ctx); err != nil {
				t.Error(err)
			}
		}()
		if rr := do(sp, method, path, body); rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
	}

	scenarios := "/api/v1/item-definitions/" + itemID + "/damage-scenarios"
	otherScenarios := "/api/v1/item-definitions/" + otherItemID + "/damage-scenarios"

	call(http.MethodPost, "/api/v1/item-definitions/"+projectID+"/damage-scenarios", `{"title":"x"}`, http.StatusNotFound, nil)

	var s handlers.DamageScenarioBody
	call(http.MethodPost, scenarios, `{"title":"Brake loss","road_user_harm_description":"crash"}`, http.StatusCreated, &s)
	if s.ID == "" || s.ItemDefinitionID != itemID || s.Title != "Brake loss" || s.RoadUserHarmDescription == nil {
		t.Fatalf("create returned %+v", s)
	}
	member := scenarios + "/" + s.ID

	var got handlers.DamageScenarioBody
	call(http.MethodPatch, member, `{"road_user_harm_description":null}`, http.StatusOK, &got)
	if got.Title != "Brake loss" || got.RoadUserHarmDescription != nil {
		t.Fatalf("null must clear the field and omitted fields must be kept: %+v", got)
	}
	got = handlers.DamageScenarioBody{}
	call(http.MethodPut, member, `{"title":"Replaced","functionality_adverse_relation":"rel"}`, http.StatusOK, &got)
	if got.Title != "Replaced" || got.FunctionalityAdverseRelation == nil || got.RoadUserHarmDescription != nil {
		t.Fatalf("put must replace all fields: %+v", got)
	}
	var list []handlers.DamageScenarioBody

	// Lists are ordered by title and paginated.
	call(http.MethodPost, scenarios, `{"title":"Aaa"}`, http.StatusCreated, nil)
	call(http.MethodPost, scenarios, `{"title":"Zzz"}`, http.StatusCreated, nil)
	call(http.MethodGet, scenarios+"?limit=1&offset=1", "", http.StatusOK, &list)
	if len(list) != 1 || list[0].Title != "Replaced" {
		t.Fatalf("second page of size 1 must be the middle scenario: %+v", list)
	}
	call(http.MethodGet, scenarios+"?offset=3", "", http.StatusOK, &list)
	if len(list) != 0 {
		t.Fatalf("offset past the end must be empty: %+v", list)
	}
	call(http.MethodGet, scenarios, "", http.StatusOK, &list)
	if len(list) != 3 {
		t.Fatalf("list returned %+v", list)
	}

	// A damage scenario is not reachable through another item definition.
	call(http.MethodGet, otherScenarios+"/"+s.ID, "", http.StatusNotFound, nil)
	call(http.MethodPut, otherScenarios+"/"+s.ID, `{"title":"x"}`, http.StatusNotFound, nil)
	call(http.MethodDelete, otherScenarios+"/"+s.ID, "", http.StatusNotFound, nil)
	call(http.MethodGet, otherScenarios, "", http.StatusOK, &list)
	if len(list) != 0 {
		t.Fatalf("other item must not list the scenario: %+v", list)
	}

	ratings := member + "/impact-ratings"
	var r handlers.ImpactRatingBody
	call(http.MethodPost, ratings, `{"impact_category":"SAFETY","rating_value":"SEVERE","reused_from_functional_safety":true}`, http.StatusCreated, &r)
	if r.ID == "" || r.DamageScenarioID != s.ID || !r.ReusedFromFunctionalSafety || r.IsOmittedByPm1507 {
		t.Fatalf("create rating returned %+v", r)
	}
	ratingPath := ratings + "/" + r.ID
	callFailing(http.MethodPost, ratings, `{"impact_category":"SAFETY"}`, http.StatusConflict)
	callFailing(http.MethodPost, ratings, `{"impact_category":"PRIVACY","rating_value":"OMITTED"}`, http.StatusUnprocessableEntity)
	callFailing(http.MethodPost, ratings, `{"impact_category":"PRIVACY","reused_from_functional_safety":true}`, http.StatusUnprocessableEntity)
	call(http.MethodPost, otherScenarios+"/"+s.ID+"/impact-ratings", `{"impact_category":"PRIVACY"}`, http.StatusNotFound, nil)

	var p handlers.ImpactRatingBody
	call(http.MethodPost, ratings, `{"impact_category":"PRIVACY","rating_value":"OMITTED","is_omitted_by_pm_15_07":true,"omission_or_rating_rationale":"covered by safety"}`, http.StatusCreated, &p)
	got2 := handlers.ImpactRatingBody{}
	call(http.MethodPatch, ratings+"/"+p.ID, `{"omission_or_rating_rationale":null}`, http.StatusOK, &got2)
	if got2.OmissionOrRatingRationale != nil || got2.RatingValue == nil || !got2.IsOmittedByPm1507 {
		t.Fatalf("patch must clear only the rationale: %+v", got2)
	}
	callFailing(http.MethodPatch, ratings+"/"+p.ID, `{"rating_value":"MAJOR"}`, http.StatusUnprocessableEntity)
	callFailing(http.MethodPatch, ratings+"/"+p.ID, `{"impact_category":"SAFETY"}`, http.StatusConflict)
	got2 = handlers.ImpactRatingBody{}
	call(http.MethodPut, ratingPath, `{"impact_category":"SAFETY","rating_value":"MAJOR"}`, http.StatusOK, &got2)
	if got2.RatingValue == nil || *got2.RatingValue != db.ImpactRatingValueMAJOR || got2.ReusedFromFunctionalSafety {
		t.Fatalf("put must replace all fields: %+v", got2)
	}
	var ratingList []handlers.ImpactRatingBody
	call(http.MethodGet, ratings, "", http.StatusOK, &ratingList)
	if len(ratingList) != 2 {
		t.Fatalf("list returned %+v", ratingList)
	}
	call(http.MethodGet, otherScenarios+"/"+s.ID+"/impact-ratings/"+r.ID, "", http.StatusNotFound, nil)
	call(http.MethodDelete, otherScenarios+"/"+s.ID+"/impact-ratings/"+r.ID, "", http.StatusNotFound, nil)
	call(http.MethodDelete, ratings+"/"+p.ID, "", http.StatusNoContent, nil)
	call(http.MethodGet, ratings+"/"+p.ID, "", http.StatusNotFound, nil)

	links := "/api/v1/item-definitions/" + itemID + "/threat-damage-links"
	linkBody := `{"threat_scenario_id":"` + threatID + `","damage_scenario_id":"` + s.ID + `"}`
	var link handlers.ThreatDamageLinkBody
	call(http.MethodPost, links, linkBody, http.StatusCreated, &link)
	callFailing(http.MethodPost, links, linkBody, http.StatusConflict)
	call(http.MethodPost, "/api/v1/item-definitions/"+otherItemID+"/threat-damage-links", linkBody, http.StatusUnprocessableEntity, nil)
	var linkList []handlers.ThreatDamageLinkBody
	call(http.MethodGet, links, "", http.StatusOK, &linkList)
	if len(linkList) != 1 {
		t.Fatalf("link list returned %+v", linkList)
	}
	call(http.MethodGet, links+"?limit=1&offset=1", "", http.StatusOK, &linkList)
	if len(linkList) != 0 {
		t.Fatalf("offset past the only link must be empty: %+v", linkList)
	}
	call(http.MethodDelete, "/api/v1/item-definitions/"+otherItemID+"/threat-damage-links/"+link.ID, "", http.StatusNotFound, nil)
	call(http.MethodDelete, links+"/"+link.ID, "", http.StatusNoContent, nil)
	call(http.MethodDelete, links+"/"+link.ID, "", http.StatusNotFound, nil)

	// Deleting a damage scenario removes its impact ratings and links.
	call(http.MethodPost, links, linkBody, http.StatusCreated, nil)
	call(http.MethodDelete, member, "", http.StatusNoContent, nil)
	call(http.MethodGet, member, "", http.StatusNotFound, nil)
	call(http.MethodGet, ratingPath, "", http.StatusNotFound, nil)
	call(http.MethodGet, links, "", http.StatusOK, &linkList)
	if len(linkList) != 0 {
		t.Fatalf("links must be deleted with the scenario: %+v", linkList)
	}
}
