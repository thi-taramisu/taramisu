package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

func TestItemDefinitionPostgresCRUD(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to test against a migrated PostgreSQL database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
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
	for _, statement := range []string{
		`INSERT INTO iam_user (id,external_iam_sub) VALUES ('` + itemUserID + `','item-definition-crud-test')`,
		`INSERT INTO tara_project (id,name) VALUES ('` + itemProjectID + `','CRUD test')`,
		`INSERT INTO project_role_assignment (tara_project_id,user_id,project_role) VALUES ('` + itemProjectID + `','` + itemUserID + `','OWNER')`,
	} {
		if _, err := tx.Exec(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	queries := db.NewStore(tx)
	handler, token := authenticatedAPI(t, queries, newItemStore())
	call := func(method, path, body string, want int) *handlers.ItemDefinition {
		t.Helper()
		w := request(handler, method, path, body, token)
		if w.Code != want {
			t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body.String())
		}
		if want != 200 && want != 201 {
			return nil
		}
		var item handlers.ItemDefinition
		if err := json.Unmarshal(w.Body.Bytes(), &item); err != nil {
			t.Fatal(err)
		}
		return &item
	}
	item := call("POST", itemCollection, `{"name":"Headlamp","scope_type":"ITEM","lifecycle_phase":"development","item_definition_wp_09_01":"definition","cybersecurity_specs_wp_10_01":"specs","architectural_design":"original","boundary":"ECU and CAN interface","functions":"Headlamp control","operational_environment":"Vehicle network"}`, 201)
	path := itemCollection + "/" + item.ID
	originalCreatedAt := item.CreatedAt
	if item.ID == "" || item.TaraProjectID != itemProjectID || originalCreatedAt.IsZero() {
		t.Fatalf("invalid generated metadata: %+v", item)
	}
	item = call("GET", path, "", 200)
	if item.LifecyclePhase == nil || *item.LifecyclePhase != "development" || item.Boundary == nil || *item.Boundary != "ECU and CAN interface" || item.Functions == nil || *item.Functions != "Headlamp control" || item.OperationalEnvironment == nil || *item.OperationalEnvironment != "Vehicle network" {
		t.Fatal("create did not persist optional fields")
	}
	item = call("PATCH", path, `{"name":"Updated","lifecycle_phase":null,"architectural_design":"patched","boundary":null,"functions":"Updated control"}`, 200)
	if item.Boundary != nil || item.Functions == nil || *item.Functions != "Updated control" || item.OperationalEnvironment == nil || *item.OperationalEnvironment != "Vehicle network" || item.Name != "Updated" || item.LifecyclePhase != nil || item.ItemDefinitionWP0901 == nil || *item.ItemDefinitionWP0901 != "definition" || item.ArchitecturalDesign == nil || *item.ArchitecturalDesign != "patched" {
		t.Fatalf("patch lost or retained wrong fields: %+v", item)
	}
	item = call("PATCH", path, `{"scope_type":"COMPONENT","item_definition_wp_09_01":"updated definition","cybersecurity_specs_wp_10_01":null,"operational_environment":"Workshop access"}`, 200)
	if item.OperationalEnvironment == nil || *item.OperationalEnvironment != "Workshop access" || item.ScopeType != db.ScopeTypeCOMPONENT || item.Name != "Updated" || item.ItemDefinitionWP0901 == nil || *item.ItemDefinitionWP0901 != "updated definition" || item.CybersecuritySpecsWP1001 != nil || item.ArchitecturalDesign == nil || *item.ArchitecturalDesign != "patched" {
		t.Fatalf("patch did not preserve and update the selected fields: %+v", item)
	}
	item = call("PATCH", path, `{"functions":null,"operational_environment":null}`, 200)
	if item.Functions != nil || item.OperationalEnvironment != nil || item.Name != "Updated" {
		t.Fatalf("explicit null did not clear definition fields: %+v", item)
	}
	item = call("PUT", path, `{"name":"Replacement with definition","scope_type":"ITEM","boundary":"ECU","functions":"Lighting","operational_environment":"Vehicle"}`, 200)
	if item.Boundary == nil || *item.Boundary != "ECU" || item.Functions == nil || *item.Functions != "Lighting" || item.OperationalEnvironment == nil || *item.OperationalEnvironment != "Vehicle" {
		t.Fatalf("replacement did not persist definition fields: %+v", item)
	}
	item = call("PUT", path, `{"name":"Replaced","scope_type":"COMPONENT"}`, 200)
	if item.Boundary != nil || item.Functions != nil || item.OperationalEnvironment != nil || item.Name != "Replaced" || item.ScopeType != db.ScopeTypeCOMPONENT || item.ItemDefinitionWP0901 != nil || item.CybersecuritySpecsWP1001 != nil || item.ArchitecturalDesign != nil || !item.CreatedAt.Equal(originalCreatedAt) {
		t.Fatalf("replacement did not clear omitted fields or preserve metadata: %+v", item)
	}
	w := request(handler, http.MethodGet, itemCollection+"?limit=1&offset=0", "", token)
	var items []handlers.ItemDefinition
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &items) != nil || len(items) != 1 || items[0].ID != item.ID {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	w = request(handler, http.MethodGet, itemCollection+"?limit=1&offset=1", "", token)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &items) != nil || len(items) != 0 {
		t.Fatalf("pagination: %d %s", w.Code, w.Body.String())
	}

	// A valid UUID belonging to a different project must not reveal or mutate this item.
	const otherProject = "44444444-4444-4444-8444-444444444444"
	if _, err := tx.Exec(ctx, `INSERT INTO tara_project (id,name) VALUES ($1,'Other')`, otherProject); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_role_assignment (tara_project_id,user_id,project_role) VALUES ($1,$2,'OWNER')`, otherProject, itemUserID); err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{"GET", "PUT", "PATCH", "DELETE"} {
		call(method, "/api/v1/projects/"+otherProject+"/item-definitions/"+item.ID, `{"name":"Wrong project","scope_type":"ITEM"}`, 404)
	}

	// All assigned roles can read; only OWNER and EDITOR can mutate.
	for _, role := range []string{"VIEWER", "EDITOR", "OWNER"} {
		if _, err := tx.Exec(ctx, `UPDATE project_role_assignment SET project_role=$1 WHERE tara_project_id=$2`, role, itemProjectID); err != nil {
			t.Fatal(err)
		}
		call("GET", path, "", 200)
		want := 403
		if role == "OWNER" || role == "EDITOR" {
			want = 200
		}
		call("PATCH", path, `{"name":"Role check"}`, want)
	}
	// Group membership comes from the signed access token, not a local membership table.
	if _, err := tx.Exec(ctx, `DELETE FROM project_role_assignment WHERE tara_project_id=$1`, itemProjectID); err != nil {
		t.Fatal(err)
	}
	call("GET", path, "", 404)
	var groupID string
	if err := tx.QueryRow(ctx, `INSERT INTO iam_group (external_iam_group_id) VALUES ($1) RETURNING id::text`, teamGroupID).Scan(&groupID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_role_assignment (tara_project_id,group_id,project_role) VALUES ($1,$2,'EDITOR')`, itemProjectID, groupID); err != nil {
		t.Fatal(err)
	}
	// The assignment grants nothing until the user's token carries the group.
	call("PATCH", path, `{"name":"Not a group member"}`, 404)
	fixture := authtest.NewFixture(t, newItemStore())
	handler = httpapi.New(queries, fixture.Manager)
	groupToken := "Bearer " + fixture.Token(t, map[string]any{"taramisu_groups": []string{teamGroupID}})
	token = &groupToken
	call("PATCH", path, `{"name":"Group editor"}`, 200)

	// Deleting an item with its full content is covered by TestItemDefinitionDeleteCascadePostgres.
	call("DELETE", path, "", 204)
	call("GET", path, "", 404)
	call("DELETE", path, "", 404)
}
