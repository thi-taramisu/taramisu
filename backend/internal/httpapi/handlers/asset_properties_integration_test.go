package handlers_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2/humatest"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

type propertyFixture struct {
	tx                                              pgx.Tx
	api                                             humatest.TestAPI
	item, otherItem, asset, secondAsset, otherAsset string
	property, otherProperty                         string
	damage, secondDamage, otherDamage               string
	threat, secondThreat, otherThreat               string
}

func newPropertyFixture(t *testing.T) propertyFixture {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := tx.Rollback(ctx); err != nil {
			t.Error(err)
		}
	})
	insertID := func(query string, args ...any) string {
		t.Helper()
		var id string
		if err := tx.QueryRow(ctx, query, args...).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	f := propertyFixture{tx: tx}
	for _, target := range []*string{&f.item, &f.otherItem} {
		project := insertID("INSERT INTO tara_project (name) VALUES ('property API test') RETURNING id")
		*target = insertID("INSERT INTO item_definition (tara_project_id, name, scope_type) VALUES ($1, 'test', 'ITEM') RETURNING id", project)
	}
	for _, row := range []struct {
		dest *string
		item string
	}{{&f.asset, f.item}, {&f.secondAsset, f.item}, {&f.otherAsset, f.otherItem}} {
		*row.dest = insertID("INSERT INTO asset (item_definition_id, name) VALUES ($1, 'ECU') RETURNING id", row.item)
	}
	f.property = insertID("INSERT INTO asset_cybersecurity_property (asset_id, property_type) VALUES ($1, 'CONFIDENTIALITY') RETURNING id", f.secondAsset)
	f.otherProperty = insertID("INSERT INTO asset_cybersecurity_property (asset_id, property_type) VALUES ($1, 'INTEGRITY') RETURNING id", f.otherAsset)
	for _, row := range []struct {
		dest *string
		item string
	}{{&f.damage, f.item}, {&f.secondDamage, f.item}, {&f.otherDamage, f.otherItem}} {
		*row.dest = insertID("INSERT INTO damage_scenario (item_definition_id, title) VALUES ($1, 'damage') RETURNING id", row.item)
	}
	for _, row := range []struct {
		dest *string
		item string
	}{{&f.threat, f.item}, {&f.secondThreat, f.item}, {&f.otherThreat, f.otherItem}} {
		*row.dest = insertID("INSERT INTO threat_scenario (item_definition_id, title) VALUES ($1, 'threat') RETURNING id", row.item)
	}
	_, f.api = humatest.New(t)
	queries := db.New(tx)
	handlers.NewAssets(queries).Register(f.api)
	handlers.NewAssetProperties(queries).Register(f.api)
	handlers.NewDamageScenarioAssetProperties(queries).Register(f.api)
	handlers.NewThreatScenarioAssetProperties(queries).Register(f.api)
	return f
}

func propertyResponse(t *testing.T, response *httptest.ResponseRecorder, status int) map[string]any {
	t.Helper()
	if response.Code != status {
		t.Fatalf("got %d, want %d: %s", response.Code, status, response.Body)
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func propertyStatus(t *testing.T, response *httptest.ResponseRecorder, status int) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("got %d, want %d: %s", response.Code, status, response.Body)
	}
}

func propertyConflict(t *testing.T, f propertyFixture, request func() *httptest.ResponseRecorder) {
	t.Helper()
	ctx := context.Background()
	if _, err := f.tx.Exec(ctx, "SAVEPOINT expected_conflict"); err != nil {
		t.Fatal(err)
	}
	propertyStatus(t, request(), 409)
	if _, err := f.tx.Exec(ctx, "ROLLBACK TO SAVEPOINT expected_conflict"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.tx.Exec(ctx, "RELEASE SAVEPOINT expected_conflict"); err != nil {
		t.Fatal(err)
	}
}

func TestAssetPropertyPostgresCRUD(t *testing.T) {
	f := newPropertyFixture(t)
	collection := "/api/v1/item-definitions/" + f.item + "/assets/" + f.asset + "/cybersecurity-properties"
	created := f.api.Post(collection, map[string]any{"property_type": "INTEGRITY", "description": "original"})
	body := propertyResponse(t, created, 201)
	id := body["id"].(string)
	path := collection + "/" + id
	if created.Header().Get("Location") != path || body["asset_id"] != f.asset {
		t.Fatalf("creation: %v", body)
	}
	propertyConflict(t, f, func() *httptest.ResponseRecorder {
		return f.api.Post(collection, map[string]any{"property_type": "INTEGRITY"})
	})
	propertyResponse(t, f.api.Post(collection, map[string]any{"property_type": "AVAILABILITY"}), 201)
	propertyConflict(t, f, func() *httptest.ResponseRecorder {
		return f.api.Put(path, map[string]any{"property_type": "AVAILABILITY"})
	})
	propertyConflict(t, f, func() *httptest.ResponseRecorder {
		return f.api.Patch(path, map[string]any{"property_type": "AVAILABILITY"})
	})
	body = propertyResponse(t, f.api.Patch(path, map[string]any{"property_type": "CONFIDENTIALITY"}), 200)
	if body["description"] != "original" || body["property_type"] != "CONFIDENTIALITY" {
		t.Fatalf("patch: %v", body)
	}
	propertyResponse(t, f.api.Patch(path, strings.NewReader(`{"description":null}`)), 200)
	if body := propertyResponse(t, f.api.Get(path), 200); body["description"] != nil {
		t.Fatalf("clear description: %v", body)
	}
	propertyResponse(t, f.api.Patch(path, map[string]any{"description": "restored"}), 200)
	body = propertyResponse(t, f.api.Put(path, map[string]any{"property_type": "INTEGRITY"}), 200)
	if body["description"] != nil || body["id"] != id || body["asset_id"] != f.asset {
		t.Fatalf("replacement: %v", body)
	}
	body = propertyResponse(t, f.api.Patch(path, strings.NewReader(`{}`)), 200)
	if body["property_type"] != "INTEGRITY" {
		t.Fatalf("empty patch: %v", body)
	}
	propertyStatus(t, f.api.Get(collection+"?limit=1"), 200)
	for _, offset := range []string{"2", "2147483647"} {
		response := f.api.Get(collection + "?offset=" + offset)
		propertyStatus(t, response, 200)
		if response.Body.String() != "[]\n" {
			t.Fatalf("pagination: %s", response.Body)
		}
	}
	for _, wrongCollection := range []string{
		strings.Replace(collection, f.item, f.otherItem, 1),
		strings.Replace(collection, f.asset, f.secondAsset, 1),
	} {
		for _, method := range []string{"GET", "PUT", "PATCH", "DELETE"} {
			propertyStatus(t, f.api.Do(method, wrongCollection+"/"+id, map[string]any{"property_type": "INTEGRITY"}), 404)
		}
	}
	propertyStatus(t, f.api.Post(strings.Replace(collection, f.item, f.otherItem, 1), map[string]any{"property_type": "INTEGRITY"}), 404)
	for _, method := range []string{"POST", "PUT", "PATCH"} {
		target := path
		if method == "POST" {
			target = collection
		}
		propertyStatus(t, f.api.Do(method, target, map[string]any{"property_type": "INTEGRITY", "asset_id": f.secondAsset}), 422)
	}
	// Deleting a property cascades both kinds of scenario links, preserving the asset and scenarios.
	for _, kind := range []string{"damage", "threat"} {
		scenario := f.damage
		if kind == "threat" {
			scenario = f.threat
		}
		propertyResponse(t, f.api.Post("/api/v1/item-definitions/"+f.item+"/"+kind+"-scenario-asset-properties",
			map[string]any{kind + "_scenario_id": scenario, "asset_cybersecurity_property_id": id}), 201)
	}
	propertyStatus(t, f.api.Delete(path), 204)
	propertyStatus(t, f.api.Get(path), 404)
	propertyStatus(t, f.api.Delete(path), 404)
	var count int
	if err := f.tx.QueryRow(context.Background(), `SELECT
		(SELECT count(*) FROM damage_scenario_asset_property WHERE asset_cybersecurity_property_id=$1) +
		(SELECT count(*) FROM threat_scenario_asset_property WHERE asset_cybersecurity_property_id=$1)`, id).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("scenario links did not cascade")
	}
	propertyStatus(t, f.api.Get("/api/v1/item-definitions/"+f.item+"/assets/"+f.asset), 200)
}

func TestScenarioAssetPropertyPostgresCRUD(t *testing.T) {
	for _, kind := range []string{"damage", "threat"} {
		t.Run(kind, func(t *testing.T) {
			f := newPropertyFixture(t)
			scenario, secondScenario, otherScenario := f.damage, f.secondDamage, f.otherDamage
			if kind == "threat" {
				scenario, secondScenario, otherScenario = f.threat, f.secondThreat, f.otherThreat
			}
			field := kind + "_scenario_id"
			collection := "/api/v1/item-definitions/" + f.item + "/" + kind + "-scenario-asset-properties"
			payload := func(s, p string) map[string]any {
				return map[string]any{field: s, "asset_cybersecurity_property_id": p}
			}
			body := payload(scenario, f.property)
			if kind == "damage" {
				body["compromise_mechanism_note"] = "original"
			}
			created := f.api.Post(collection, body)
			row := propertyResponse(t, created, 201)
			id := row["id"].(string)
			path := collection + "/" + id
			if created.Header().Get("Location") != path || row[field] != scenario || row["asset_cybersecurity_property_id"] != f.property {
				t.Fatalf("create: %v", row)
			}
			propertyConflict(t, f, func() *httptest.ResponseRecorder { return f.api.Post(collection, body) })
			propertyResponse(t, f.api.Post(collection, payload(secondScenario, f.property)), 201)
			propertyConflict(t, f, func() *httptest.ResponseRecorder { return f.api.Put(path, payload(secondScenario, f.property)) })
			propertyConflict(t, f, func() *httptest.ResponseRecorder { return f.api.Patch(path, map[string]any{field: secondScenario}) })
			// Retargeting to another valid property must preserve an omitted scenario and note.
			propertyCollection := "/api/v1/item-definitions/" + f.item + "/assets/" + f.asset + "/cybersecurity-properties"
			newProperty := propertyResponse(t, f.api.Post(propertyCollection, map[string]any{"property_type": "INTEGRITY"}), 201)["id"].(string)
			row = propertyResponse(t, f.api.Patch(path, map[string]any{"asset_cybersecurity_property_id": newProperty}), 200)
			if row[field] != scenario || row["asset_cybersecurity_property_id"] != newProperty || (kind == "damage" && row["compromise_mechanism_note"] != "original") {
				t.Fatalf("patch: %v", row)
			}
			row = propertyResponse(t, f.api.Patch(path, map[string]any{field: secondScenario}), 200)
			if row[field] != secondScenario || row["asset_cybersecurity_property_id"] != newProperty {
				t.Fatalf("patch scenario: %v", row)
			}
			if kind == "damage" {
				row = propertyResponse(t, f.api.Patch(path, strings.NewReader(`{"compromise_mechanism_note":null}`)), 200)
				if row["compromise_mechanism_note"] != nil {
					t.Fatalf("clear note: %v", row)
				}
				propertyResponse(t, f.api.Patch(path, map[string]any{"compromise_mechanism_note": "restored"}), 200)
			}
			row = propertyResponse(t, f.api.Put(path, payload(scenario, newProperty)), 200)
			if row["id"] != id || row[field] != scenario || row["asset_cybersecurity_property_id"] != newProperty || (kind == "damage" && row["compromise_mechanism_note"] != nil) {
				t.Fatalf("replace: %v", row)
			}
			propertyResponse(t, f.api.Patch(path, strings.NewReader(`{}`)), 200)
			propertyResponse(t, f.api.Get(path), 200)
			for _, query := range []string{"", "?limit=1", "?offset=2", "?offset=2147483647"} {
				response := f.api.Get(collection + query)
				propertyStatus(t, response, 200)
				var rows []map[string]any
				if err := json.Unmarshal(response.Body.Bytes(), &rows); err != nil {
					t.Fatal(err)
				}
				want := 2
				if query == "?limit=1" {
					want = 1
				} else if strings.HasPrefix(query, "?offset=") {
					want = 0
				}
				if len(rows) != want {
					t.Fatalf("list %s: %s", query, response.Body)
				}
			}
			// Either reference from another item is rejected for every write operation.
			for _, invalid := range []map[string]any{
				payload(otherScenario, newProperty), payload(scenario, f.otherProperty),
				payload("00000000-0000-4000-8000-999999999999", newProperty),
				payload(scenario, "00000000-0000-4000-8000-999999999999"),
			} {
				propertyStatus(t, f.api.Post(collection, invalid), 404)
				propertyStatus(t, f.api.Put(path, invalid), 404)
				propertyStatus(t, f.api.Patch(path, invalid), 404)
			}
			otherCollection := strings.Replace(collection, f.item, f.otherItem, 1)
			for _, method := range []string{"GET", "PUT", "PATCH", "DELETE"} {
				propertyStatus(t, f.api.Do(method, otherCollection+"/"+id, payload(otherScenario, f.otherProperty)), 404)
			}
			response := f.api.Get(otherCollection)
			propertyStatus(t, response, 200)
			if response.Body.String() != "[]\n" {
				t.Fatalf("item isolation: %s", response.Body)
			}
			propertyResponse(t, f.api.Get(path), 200)
			propertyStatus(t, f.api.Delete(path), 204)
			for _, method := range []string{"GET", "PUT", "PATCH", "DELETE"} {
				propertyStatus(t, f.api.Do(method, path, payload(scenario, f.property)), 404)
			}
		})
	}
}
