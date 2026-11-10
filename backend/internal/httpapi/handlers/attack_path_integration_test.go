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

func TestAttackPathPostgresLifecycle(t *testing.T) {
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
	handler := httpapi.New(db.New(tx), manager)
	call := func(method, path, body string, want int) []byte {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", bearer)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		return rr.Body.Bytes()
	}

	// serve builds the API on q, so a request can also run on a savepoint.
	serve := func(q db.DBTX, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", bearer)
		rr := httptest.NewRecorder()
		httpapi.New(db.New(q), manager).ServeHTTP(rr, req)
		return rr
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
		if rr := serve(sp, method, path, body); rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
	}

	paths := "/api/v1/item-definitions/" + itemID + "/attack-paths"
	var created handlers.AttackPathBody
	if err := json.Unmarshal(call(http.MethodPost, paths, `{"title":"Remote","analysis_approach":"TOP_DOWN"}`, http.StatusCreated), &created); err != nil {
		t.Fatal(err)
	}
	if created.ID == "" || created.ItemDefinitionID != itemID || created.Title != "Remote" || !created.IsPartialEarlyStage {
		t.Fatalf("create returned %+v", created)
	}
	member := paths + "/" + created.ID

	var got handlers.AttackPathBody
	if err := json.Unmarshal(call(http.MethodPatch, member, `{"is_partial_early_stage":false}`, http.StatusOK), &got); err != nil {
		t.Fatal(err)
	}
	if got.Title != "Remote" || got.AnalysisApproach == nil || got.IsPartialEarlyStage {
		t.Fatalf("omitted fields must be kept: %+v", got)
	}
	got = handlers.AttackPathBody{}
	if err := json.Unmarshal(call(http.MethodPatch, member, `{"analysis_approach":null}`, http.StatusOK), &got); err != nil {
		t.Fatal(err)
	}
	if got.Title != "Remote" || got.AnalysisApproach != nil {
		t.Fatalf("null must clear the field and keep the others: %+v", got)
	}
	got = handlers.AttackPathBody{}
	if err := json.Unmarshal(call(http.MethodPut, member, `{"title":"Replaced"}`, http.StatusOK), &got); err != nil {
		t.Fatal(err)
	}
	if got.Title != "Replaced" || got.AnalysisApproach != nil {
		t.Fatalf("put must clear omitted fields: %+v", got)
	}

	var list []handlers.AttackPathBody
	if err := json.Unmarshal(call(http.MethodGet, paths, "", http.StatusOK), &list); err != nil || len(list) != 1 {
		t.Fatalf("list: %v %+v", err, list)
	}

	// An attack path is not reachable through another item definition.
	other := "/api/v1/item-definitions/" + otherItemID + "/attack-paths"
	call(http.MethodGet, other+"/"+created.ID, "", http.StatusNotFound)
	call(http.MethodDelete, other+"/"+created.ID, "", http.StatusNotFound)
	call(http.MethodPut, other+"/"+created.ID+"/feasibility-rating", `{}`, http.StatusNotFound)

	rating := member + "/feasibility-rating"
	call(http.MethodGet, rating, "", http.StatusNotFound)
	callFailing(http.MethodPut, rating, `{"ap_total_score":7}`, http.StatusUnprocessableEntity)
	call(http.MethodPut, rating, `{"ap_elapsed_time":1,"ap_specialist_expertise":2,"ap_knowledge_of_item":1,"ap_window_of_opportunity":1,"ap_equipment":2,"ap_total_score":7,"feasibility_rating":"HIGH","rationale":"why"}`, http.StatusOK)
	var r handlers.AttackFeasibilityRatingBody
	if err := json.Unmarshal(call(http.MethodPatch, rating, `{"rationale":"new"}`, http.StatusOK), &r); err != nil {
		t.Fatal(err)
	}
	if r.Rationale == nil || *r.Rationale != "new" || r.ApTotalScore == nil || *r.ApTotalScore != 7 {
		t.Fatalf("patch must keep omitted fields: %+v", r)
	}
	r = handlers.AttackFeasibilityRatingBody{}
	if err := json.Unmarshal(call(http.MethodPatch, rating, `{"rationale":null}`, http.StatusOK), &r); err != nil {
		t.Fatal(err)
	}
	if r.Rationale != nil || r.ApTotalScore == nil || *r.ApTotalScore != 7 {
		t.Fatalf("null must clear the rationale and keep the others: %+v", r)
	}

	links := "/api/v1/item-definitions/" + itemID + "/threat-attack-path-links"
	linkBody := `{"threat_scenario_id":"` + threatID + `","attack_path_id":"` + created.ID + `"}`
	var link handlers.ThreatAttackPathLinkBody
	if err := json.Unmarshal(call(http.MethodPost, links, linkBody, http.StatusCreated), &link); err != nil {
		t.Fatal(err)
	}
	callFailing(http.MethodPost, links, linkBody, http.StatusConflict)
	call(http.MethodPost, "/api/v1/item-definitions/"+otherItemID+"/threat-attack-path-links", linkBody, http.StatusUnprocessableEntity)
	var linkList []handlers.ThreatAttackPathLinkBody
	if err := json.Unmarshal(call(http.MethodGet, links, "", http.StatusOK), &linkList); err != nil || len(linkList) != 1 {
		t.Fatalf("link list: %v %+v", err, linkList)
	}
	call(http.MethodDelete, links+"/"+link.ID, "", http.StatusNoContent)
	call(http.MethodDelete, links+"/"+link.ID, "", http.StatusNotFound)

	call(http.MethodDelete, rating, "", http.StatusNoContent)
	call(http.MethodDelete, rating, "", http.StatusNotFound)
	call(http.MethodDelete, member, "", http.StatusNoContent)
	call(http.MethodGet, member, "", http.StatusNotFound)
}
