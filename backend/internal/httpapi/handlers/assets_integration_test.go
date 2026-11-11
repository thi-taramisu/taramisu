package handlers_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

func TestAssetPostgresCRUD(t *testing.T) {
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
		if err := tx.Rollback(ctx); err != nil {
			t.Error(err)
		}
	}()
	queries := db.NewStore(tx)
	fixture := authtest.NewFixture(t, queries)
	bearer := "Bearer " + fixture.Token(t, nil)
	h := httpapi.New(queries, fixture.Manager)
	request := func(method, path string, body any) *httptest.ResponseRecorder {
		return assetRequest(t, h, bearer, method, path, body)
	}
	createdProject := request("POST", "/api/v1/projects", map[string]any{"name": "asset API test"})
	if createdProject.Code != 201 {
		t.Fatalf("create project: %d %s", createdProject.Code, createdProject.Body)
	}
	var project struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(createdProject.Body.Bytes(), &project); err != nil {
		t.Fatal(err)
	}
	var item, otherItem string
	for _, dest := range []*string{&item, &otherItem} {
		if err := tx.QueryRow(ctx, "INSERT INTO item_definition (tara_project_id, name, scope_type) VALUES ($1, 'test', 'ITEM') RETURNING id", project.ID).Scan(dest); err != nil {
			t.Fatal(err)
		}
	}
	collection := "/api/v1/item-definitions/" + item + "/assets"
	otherCollection := "/api/v1/item-definitions/" + otherItem + "/assets"
	created := request("POST", collection, map[string]any{"name": "ECU", "description": "original", "identification_source": "ITEM_DEF"})
	if created.Code != 201 {
		t.Fatalf("create: %d %s", created.Code, created.Body)
	}
	var asset handlers.Asset
	if err := json.Unmarshal(created.Body.Bytes(), &asset); err != nil {
		t.Fatal(err)
	}
	path := collection + "/" + asset.ID
	if created.Header().Get("Location") != path {
		t.Fatalf("Location = %q, want %q", created.Header().Get("Location"), path)
	}
	read := func() handlers.Asset {
		t.Helper()
		r := request("GET", path, nil)
		if r.Code != 200 {
			t.Fatalf("get: %d %s", r.Code, r.Body)
		}
		var a handlers.Asset
		if err := json.Unmarshal(r.Body.Bytes(), &a); err != nil {
			t.Fatal(err)
		}
		return a
	}
	a := read()
	if a.Name != "ECU" || a.ItemDefinitionID != item || a.Description == nil || *a.Description != "original" || a.IdentificationSource == nil {
		t.Fatalf("created asset: %+v", a)
	}
	// Changing one field must preserve the others in the database.
	if r := request("PATCH", path, strings.NewReader(`{"name":"updated"}`)); r.Code != 200 {
		t.Fatal(r.Body)
	}
	a = read()
	if a.Name != "updated" || a.Description == nil || *a.Description != "original" || a.IdentificationSource == nil {
		t.Fatalf("patch lost fields: %+v", a)
	}
	if r := request("PATCH", path, strings.NewReader(`{"description":null,"identification_source":null}`)); r.Code != 200 {
		t.Fatal(r.Body)
	}
	a = read()
	if a.Description != nil || a.IdentificationSource != nil || a.Name != "updated" {
		t.Fatalf("clear fields: %+v", a)
	}
	if r := request("PATCH", path, map[string]any{"description": "", "identification_source": "CATALOGUE"}); r.Code != 200 {
		t.Fatal(r.Body)
	}
	a = read()
	if a.ItemDefinitionID != item || a.Description == nil || *a.Description != "" || a.IdentificationSource == nil || *a.IdentificationSource != db.IdentificationSourceCATALOGUE {
		t.Fatalf("patch values: %+v", a)
	}
	if r := request("GET", otherCollection, nil); r.Code != 200 || r.Body.String() != "[]\n" {
		t.Fatalf("filter: %s", r.Body)
	}
	{
		r := request("GET", collection+"?limit=1&offset=0", nil)
		var rows []handlers.Asset
		if err := json.Unmarshal(r.Body.Bytes(), &rows); err != nil {
			t.Fatal(err)
		}
		if r.Code != 200 || len(rows) != 1 || rows[0].ID != asset.ID {
			t.Fatalf("list: %s", r.Body)
		}
	}
	for _, offset := range []string{"1", "2147483647"} {
		if r := request("GET", collection+"?offset="+offset, nil); r.Code != 200 || r.Body.String() != "[]\n" {
			t.Fatalf("pagination: %s", r.Body)
		}
	}
	if r := request("PUT", path, map[string]any{"name": "replacement"}); r.Code != 200 {
		t.Fatal(r.Body)
	}
	a = read()
	if a.ID != asset.ID || a.Name != "replacement" || a.ItemDefinitionID != item || a.Description != nil || a.IdentificationSource != nil {
		t.Fatalf("replacement: %+v", a)
	}
	// A valid asset ID under another parent must not be readable or mutable.
	for _, method := range []string{"GET", "PUT", "PATCH", "DELETE"} {
		r := request(method, otherCollection+"/"+asset.ID, map[string]any{"name": "wrong parent"})
		if r.Code != 404 {
			t.Fatalf("cross-parent %s: %d %s", method, r.Code, r.Body)
		}
	}
	for _, method := range []string{"POST", "PUT", "PATCH"} {
		target := path
		if method == "POST" {
			target = collection
		}
		r := request(method, target, map[string]any{"name": "move", "item_definition_id": otherItem})
		if r.Code != 422 {
			t.Fatalf("parent in %s body accepted: %d %s", method, r.Code, r.Body)
		}
	}
	a = read()
	if a.Name != "replacement" || a.ItemDefinitionID != item {
		t.Fatalf("cross-parent request changed asset: %+v", a)
	}
	// The schema cascades property deletion when its owning asset is deleted.
	if _, err := tx.Exec(ctx, "INSERT INTO asset_cybersecurity_property (asset_id, property_type) VALUES ($1, 'INTEGRITY')", asset.ID); err != nil {
		t.Fatal(err)
	}
	if r := request("DELETE", path, nil); r.Code != 204 {
		t.Fatal(r.Body)
	}
	var properties int
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM asset_cybersecurity_property WHERE asset_id=$1", asset.ID).Scan(&properties); err != nil {
		t.Fatal(err)
	}
	if properties != 0 {
		t.Fatal("asset properties were not deleted")
	}
	for _, method := range []string{"GET", "DELETE"} {
		r := request(method, path, map[string]any{"name": "missing"})
		if r.Code != 404 {
			t.Fatalf("missing %s: %d %s", method, r.Code, r.Body)
		}
	}
}
