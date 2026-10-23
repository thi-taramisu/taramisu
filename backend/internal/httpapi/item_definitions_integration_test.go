package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
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
		`INSERT INTO iam_user (id,external_iam_sub) VALUES ('` + userID + `','item-definition-crud-test')`,
		`INSERT INTO tara_project (id,name) VALUES ('` + projectID + `','CRUD test')`,
		`INSERT INTO project_role_assignment (tara_project_id,user_id,project_role) VALUES ('` + projectID + `','` + userID + `','OWNER')`,
	} {
		if _, err := tx.Exec(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	queries := db.New(tx)
	handler, cookie := authenticatedAPI(t, queries, newItemStore())
	call := func(method, path, body string, want int) *handlers.ItemDefinition {
		t.Helper()
		w := request(handler, method, path, body, cookie)
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
	item := call("POST", collection, `{"name":"Headlamp","scope_type":"ITEM","lifecycle_phase":"development","item_definition_wp_09_01":"definition","cybersecurity_specs_wp_10_01":"specs","architectural_design":"original"}`, 201)
	path := collection + "/" + item.ID
	originalCreatedAt := item.CreatedAt
	if item.ID == "" || item.TaraProjectID != projectID || originalCreatedAt.IsZero() {
		t.Fatalf("invalid generated metadata: %+v", item)
	}
	item = call("GET", path, "", 200)
	if item.LifecyclePhase == nil || *item.LifecyclePhase != "development" {
		t.Fatal("create did not persist optional fields")
	}
	item = call("PATCH", path, `{"name":"Updated","lifecycle_phase":null,"architectural_design":"patched"}`, 200)
	if item.Name != "Updated" || item.LifecyclePhase != nil || item.ItemDefinitionWP0901 == nil || *item.ItemDefinitionWP0901 != "definition" || item.ArchitecturalDesign == nil || *item.ArchitecturalDesign != "patched" {
		t.Fatalf("patch lost or retained wrong fields: %+v", item)
	}
	item = call("PATCH", path, `{"scope_type":"COMPONENT","item_definition_wp_09_01":"updated definition","cybersecurity_specs_wp_10_01":null}`, 200)
	if item.ScopeType != db.ScopeTypeCOMPONENT || item.Name != "Updated" || item.ItemDefinitionWP0901 == nil || *item.ItemDefinitionWP0901 != "updated definition" || item.CybersecuritySpecsWP1001 != nil || item.ArchitecturalDesign == nil || *item.ArchitecturalDesign != "patched" {
		t.Fatalf("patch did not preserve and update the selected fields: %+v", item)
	}
	item = call("PUT", path, `{"name":"Replaced","scope_type":"COMPONENT"}`, 200)
	if item.Name != "Replaced" || item.ScopeType != db.ScopeTypeCOMPONENT || item.ItemDefinitionWP0901 != nil || item.CybersecuritySpecsWP1001 != nil || item.ArchitecturalDesign != nil || !item.CreatedAt.Equal(originalCreatedAt) {
		t.Fatalf("replacement did not clear omitted fields or preserve metadata: %+v", item)
	}
	w := request(handler, http.MethodGet, collection+"?limit=1&offset=0", "", cookie)
	var items []handlers.ItemDefinition
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &items) != nil || len(items) != 1 || items[0].ID != item.ID {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	w = request(handler, http.MethodGet, collection+"?limit=1&offset=1", "", cookie)
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &items) != nil || len(items) != 0 {
		t.Fatalf("pagination: %d %s", w.Code, w.Body.String())
	}

	// A valid UUID belonging to a different project must not reveal or mutate this item.
	const otherProject = "44444444-4444-4444-8444-444444444444"
	if _, err := tx.Exec(ctx, `INSERT INTO tara_project (id,name) VALUES ($1,'Other')`, otherProject); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_role_assignment (tara_project_id,user_id,project_role) VALUES ($1,$2,'OWNER')`, otherProject, userID); err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{"GET", "PUT", "PATCH", "DELETE"} {
		call(method, "/api/v1/projects/"+otherProject+"/item-definitions/"+item.ID, `{"name":"Wrong project","scope_type":"ITEM"}`, 404)
	}

	// All assigned roles can read; only OWNER and EDITOR can mutate.
	for _, role := range []string{"VIEWER", "REVIEWER", "EDITOR", "OWNER"} {
		if _, err := tx.Exec(ctx, `UPDATE project_role_assignment SET project_role=$1 WHERE tara_project_id=$2`, role, projectID); err != nil {
			t.Fatal(err)
		}
		call("GET", path, "", 200)
		want := 404
		if role == "OWNER" || role == "EDITOR" {
			want = 200
		}
		call("PATCH", path, `{"name":"Role check"}`, want)
	}
	// Access through a persisted IAM group is supported, without granting unassigned users access.
	if _, err := tx.Exec(ctx, `DELETE FROM project_role_assignment WHERE tara_project_id=$1`, projectID); err != nil {
		t.Fatal(err)
	}
	call("GET", path, "", 404)
	var groupID string
	if err := tx.QueryRow(ctx, `INSERT INTO iam_group (external_iam_group_id) VALUES ('crud-test-group') RETURNING id::text`).Scan(&groupID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO iam_user_group_member (user_id,group_id) VALUES ($1,$2)`, userID, groupID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_role_assignment (tara_project_id,group_id,project_role) VALUES ($1,$2,'EDITOR')`, projectID, groupID); err != nil {
		t.Fatal(err)
	}
	call("PATCH", path, `{"name":"Group editor"}`, 200)

	// Keep dependent domain data: deletion fails rather than silently cascading.
	if _, err := tx.Exec(ctx, `INSERT INTO asset (item_definition_id,name) VALUES ($1,'Headlamp ECU')`, item.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "SAVEPOINT before_delete"); err != nil {
		t.Fatal(err)
	}
	call("DELETE", path, "", 409)
	if _, err := tx.Exec(ctx, "ROLLBACK TO SAVEPOINT before_delete"); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM asset WHERE item_definition_id=$1`, item.ID); err != nil {
		t.Fatal(err)
	}
	call("DELETE", path, "", 204)
	call("GET", path, "", 404)
	call("DELETE", path, "", 404)
}
