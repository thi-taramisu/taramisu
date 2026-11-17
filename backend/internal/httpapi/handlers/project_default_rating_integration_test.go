package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
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

func TestProjectDefaultRatingPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires migrated TEST_DATABASE_URL")
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
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	fixture := authtest.NewFixture(t, queries)
	owner := fixture.Token(t, nil)
	api := httpapi.New(queries, fixture.Manager)
	call := func(token, method, path, body string, want int) []byte {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rr := httptest.NewRecorder()
		api.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: %d want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		return rr.Body.Bytes()
	}
	decode := func(data []byte, dst any) {
		t.Helper()
		if err := json.Unmarshal(data, dst); err != nil {
			t.Fatal(err)
		}
	}
	var project handlers.TaraProjectBody
	decode(call(owner, "POST", "/api/v1/projects", `{"name":"Defaults","default_rating_method":"CVSS"}`, 201), &project)
	projectPath := "/api/v1/projects/" + project.ID
	assertDefault := func(data []byte, want string) {
		t.Helper()
		var p handlers.TaraProjectBody
		decode(data, &p)
		if want == "" {
			if p.DefaultRatingMethod != nil {
				t.Fatalf("default = %v, want null", *p.DefaultRatingMethod)
			}
		} else if p.DefaultRatingMethod == nil || *p.DefaultRatingMethod != want {
			t.Fatalf("default = %v, want %s", p.DefaultRatingMethod, want)
		}
	}
	assertDefault(call(owner, "GET", projectPath, "", 200), "CVSS")
	var projects []handlers.TaraProjectBody
	decode(call(owner, "GET", "/api/v1/projects", "", 200), &projects)
	if len(projects) != 1 || projects[0].DefaultRatingMethod == nil || *projects[0].DefaultRatingMethod != "CVSS" {
		t.Fatalf("project list lost default: %+v", projects)
	}

	// All members can read the default; only the Owner can change it.
	for _, role := range []string{"VIEWER", "EDITOR"} {
		token := fixture.Token(t, map[string]any{"sub": "default-" + role})
		var me struct {
			ID string `json:"id"`
		}
		decode(call(token, "GET", "/api/v1/me", "", 200), &me)
		if _, err := tx.Exec(ctx, `INSERT INTO project_role_assignment (tara_project_id,user_id,project_role) VALUES ($1,$2,$3)`, project.ID, me.ID, role); err != nil {
			t.Fatal(err)
		}
		assertDefault(call(token, "GET", projectPath, "", 200), "CVSS")
		call(token, "PATCH", projectPath, `{"default_rating_method":"ATTACK_VECTOR"}`, 403)
		call(token, "PUT", projectPath, `{"name":"forbidden","default_rating_method":null}`, 403)
	}
	outsider := fixture.Token(t, map[string]any{"sub": "default-outsider"})
	call(outsider, "PATCH", projectPath, `{"default_rating_method":null}`, 404)
	call("", "PATCH", projectPath, `{"default_rating_method":null}`, 401)

	var item handlers.ItemDefinition
	decode(call(owner, "POST", projectPath+"/item-definitions", `{"name":"Battery","scope_type":"ITEM"}`, 201), &item)
	paths := "/api/v1/item-definitions/" + item.ID + "/attack-paths"
	create := func(body, want string) handlers.AttackPathBody {
		t.Helper()
		var p handlers.AttackPathBody
		decode(call(owner, "POST", paths, body, 201), &p)
		if p.InitialRatingMethod != want {
			t.Fatalf("initial method = %s, want %s", p.InitialRatingMethod, want)
		}
		return p
	}
	cvss := create(`{"title":"Inherited CVSS"}`, "CVSS")
	// Inheritance selects the method without manufacturing a rating or any inputs.
	cvssRating := paths + "/" + cvss.ID + "/feasibility-rating"
	call(owner, "GET", cvssRating, "", 404)
	assertDefault(call(owner, "PATCH", projectPath, `{"default_rating_method":"ATTACK_VECTOR"}`, 200), "ATTACK_VECTOR")
	vector := create(`{"title":"Inherited vector"}`, "ATTACK_VECTOR")
	explicit := create(`{"title":"Explicit AP","initial_rating_method":"ATTACK_POTENTIAL"}`, "ATTACK_POTENTIAL")
	// A different project must not accidentally use this project's default.
	var other handlers.TaraProjectBody
	decode(call(owner, "POST", "/api/v1/projects", `{"name":"Other"}`, 201), &other)
	assertDefault(call(owner, "GET", "/api/v1/projects/"+other.ID, "", 200), "")
	var otherItem handlers.ItemDefinition
	decode(call(owner, "POST", "/api/v1/projects/"+other.ID+"/item-definitions", `{"name":"Other","scope_type":"ITEM"}`, 201), &otherItem)
	var otherPath handlers.AttackPathBody
	decode(call(owner, "POST", "/api/v1/item-definitions/"+otherItem.ID+"/attack-paths", `{"title":"Fallback"}`, 201), &otherPath)
	if otherPath.InitialRatingMethod != "ATTACK_POTENTIAL" {
		t.Fatal("default leaked between projects")
	}

	// Existing unrated paths retain their creation-time method on GET, list, PUT and PATCH.
	var got handlers.AttackPathBody
	for _, operation := range []struct{ method, body string }{
		{"GET", ""}, {"PATCH", `{"title":"Renamed"}`}, {"PUT", `{"title":"Replaced"}`},
	} {
		decode(call(owner, operation.method, paths+"/"+cvss.ID, operation.body, 200), &got)
		if got.InitialRatingMethod != "CVSS" {
			t.Fatal("path update changed initial method")
		}
	}
	var listed []handlers.AttackPathBody
	decode(call(owner, "GET", paths, "", 200), &listed)
	if len(listed) != 3 {
		t.Fatalf("list: %+v", listed)
	}
	for _, p := range listed {
		if p.ID == cvss.ID && p.InitialRatingMethod != "CVSS" {
			t.Fatal("list lost initial method")
		}
	}

	// Rating PUT without a method uses the path snapshot even after changing the project default.
	rate := func(path, body, want string) {
		t.Helper()
		var r handlers.AttackFeasibilityRatingBody
		decode(call(owner, "PUT", path, body, 200), &r)
		if r.RatingMethod != want || (want != "ATTACK_POTENTIAL" && r.FeasibilityRating == nil) {
			t.Fatalf("rating: %+v, want %s", r, want)
		}
	}
	cvssInputs := `{"cvss_attack_vector":"NETWORK","cvss_attack_complexity":"LOW","cvss_privileges_required":"NONE","cvss_user_interaction":"NONE","cvss_scope":"UNCHANGED"}`
	rate(cvssRating, cvssInputs, "CVSS")
	vectorRating := paths + "/" + vector.ID + "/feasibility-rating"
	rate(vectorRating, `{"attack_vector":"NETWORK"}`, "ATTACK_VECTOR")
	rate(paths+"/"+explicit.ID+"/feasibility-rating", `{}`, "ATTACK_POTENTIAL")
	// An explicit rating method overrides the initial choice; PATCH omission retains that selection.
	rate(cvssRating, `{"rating_method":"ATTACK_VECTOR","attack_vector":"LOCAL"}`, "ATTACK_VECTOR")
	var patched handlers.AttackFeasibilityRatingBody
	decode(call(owner, "PATCH", cvssRating, `{"rationale":"keep selected method"}`, 200), &patched)
	if patched.RatingMethod != "ATTACK_VECTOR" {
		t.Fatal("PATCH reset method to initial choice")
	}
	assertDefault(call(owner, "PATCH", projectPath, `{"name":"Updated"}`, 200), "ATTACK_VECTOR")
	assertDefault(call(owner, "PATCH", projectPath, `{"default_rating_method":null}`, 200), "")
	create(`{"title":"Fallback after clearing"}`, "ATTACK_POTENTIAL")
	var stillRated handlers.AttackFeasibilityRatingBody
	decode(call(owner, "GET", cvssRating, "", 200), &stillRated)
	if stillRated.RatingMethod != "ATTACK_VECTOR" {
		t.Fatal("project default changed existing rating")
	}
	call(owner, "DELETE", cvssRating, "", 204)
	rate(cvssRating, cvssInputs, "CVSS")
	assertDefault(call(owner, "PUT", projectPath, `{"name":"Replacement","default_rating_method":"CVSS"}`, 200), "CVSS")
	assertDefault(call(owner, "PUT", projectPath, `{"name":"Cleared by replacement"}`, 200), "")

	// Missing inherited-method inputs still fail; PostgreSQL errors use a savepoint.
	for _, path := range []string{cvssRating, vectorRating} {
		sp, err := tx.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPut, path, strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+owner)
		rr := httptest.NewRecorder()
		httpapi.New(db.New(sp), fixture.Manager).ServeHTTP(rr, req)
		if rr.Code != 422 {
			t.Fatalf("missing inputs: %d: %s", rr.Code, rr.Body.String())
		}
		if err := sp.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
	}
}
