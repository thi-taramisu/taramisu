package handlers_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

func TestProjectArchivePostgres(t *testing.T) {
	if os.Getenv("TEST_DATABASE_URL") == "" {
		t.Skip("requires migrated TEST_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.NewStore(tx)
	fixture := authtest.NewFixture(t, queries)
	mux := httpapi.New(queries, fixture.Manager, httpapi.WithDirectory(&fakeDirectory{}))
	owner := fixture.Token(t, nil)
	outsider := fixture.Token(t, map[string]any{"sub": "archive-outsider"})
	call := func(token, method, path, body string, want int) []byte {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s: %d want %d: %s", method, path, w.Code, want, w.Body.String())
		}
		return w.Body.Bytes()
	}
	projectBody := call(owner, "POST", "/api/v1/projects", `{"name":"Archive test"}`, 201)
	var project handlers.TaraProjectBody
	if err := json.Unmarshal(projectBody, &project); err != nil {
		t.Fatal(err)
	}
	if project.ArchivedAt != nil {
		t.Fatal("new project is archived")
	}
	base := "/api/v1/projects/" + project.ID
	insert := func(sql string, args ...any) string {
		t.Helper()
		var id string
		if err := tx.QueryRow(ctx, sql+" RETURNING id::text", args...).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	item := seedItem(t, ctx, tx, project.ID, "Item")
	damage := seedDamageScenario(t, ctx, tx, item, "Damage")
	threat := seedThreatScenario(t, ctx, tx, item, "Threat")
	attack := seedAttackPath(t, ctx, tx, item, "Attack")
	impact := insert("INSERT INTO impact_rating(damage_scenario_id,impact_category) VALUES($1,'SAFETY')", damage)
	risk := insert("INSERT INTO risk_value(threat_scenario_id,impact_rating_id,risk_score,determination_method) VALUES($1,$2,3,'RISK_MATRIX')", threat, impact)
	memberBody := call(owner, "POST", base+"/members", `{"email":"new@example.com","role":"VIEWER"}`, 201)
	var member handlers.ProjectMember
	if err := json.Unmarshal(memberBody, &member); err != nil {
		t.Fatal(err)
	}
	viewer := fixture.Token(t, map[string]any{"sub": "new-sub"})
	for _, token := range []string{viewer, outsider, ""} {
		want := 403
		if token == outsider {
			want = 404
		}
		if token == "" {
			want = 401
		}
		call(token, "POST", base+"/archive", "", want)
		call(token, "POST", base+"/unarchive", "", want)
	}
	archived := call(owner, "POST", base+"/archive", "", 200)
	var first, again handlers.TaraProjectBody
	if err := json.Unmarshal(archived, &first); err != nil {
		t.Fatal(err)
	}
	if first.ArchivedAt == nil {
		t.Fatal("archive did not set its timestamp")
	}
	// now() is constant inside this test transaction. Seed a historical timestamp
	// so idempotency cannot pass merely because both UPDATEs used that same now().
	if _, err := tx.Exec(ctx, "UPDATE tara_project SET archived_at=$2 WHERE id=$1", project.ID, time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(call(owner, "GET", base, "", 200), &first); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(call(owner, "POST", base+"/archive", "", 200), &again); err != nil {
		t.Fatal(err)
	}
	if first.ArchivedAt == nil || again.ArchivedAt == nil || !first.ArchivedAt.Equal(*again.ArchivedAt) {
		t.Fatal("repeated archive changed its timestamp")
	}
	for _, path := range []string{base, base + "/members", base + "/item-definitions", "/api/v1/item-definitions/" + item + "/attack-paths/" + attack, "/api/v1/threat-scenarios/" + threat + "/risk-values/" + risk} {
		call(viewer, "GET", path, "", 200)
	}
	// Exercise every registered project write, including both parent lookup scopes.
	// None may reach its handler while archived, even if a future endpoint is added.
	blocked := 0
	for path, entry := range httpapi.OpenAPI().Paths {
		for method, op := range map[string]*huma.Operation{"POST": entry.Post, "PUT": entry.Put, "PATCH": entry.Patch, "DELETE": entry.Delete} {
			if op == nil || op.Extensions["x-taramisu-permission"] == nil {
				continue
			}
			if op.Extensions["x-taramisu-allow-archived"] == true {
				maintenance := strings.HasPrefix(path, "/api/v1/projects/{id}/members") ||
					path == "/api/v1/projects/{id}/archive" || path == "/api/v1/projects/{id}/unarchive" ||
					(method == "DELETE" && path == "/api/v1/projects/{id}")
				if !maintenance {
					t.Fatalf("unexpected archived-write exception: %s %s", method, path)
				}
				continue
			}
			target := strings.NewReplacer("{project_id}", project.ID, "{item_definition_id}", item, "{threat_scenario_id}", threat).Replace(path)
			id := "ffffffff-ffff-4fff-8fff-ffffffffffff"
			if strings.HasPrefix(path, "/api/v1/projects/") {
				id = project.ID
			}
			for strings.Contains(target, "{") {
				start := strings.Index(target, "{")
				end := strings.Index(target[start:], "}") + start
				target = target[:start] + id + target[end+1:]
			}
			call(owner, method, target, `{}`, 409)
			blocked++
		}
	}
	if blocked < 20 {
		t.Fatalf("unexpectedly few archived write checks: %d", blocked)
	}
	call(viewer, "PATCH", base, `{"name":"No"}`, 403)
	call(outsider, "PATCH", base, `{"name":"No"}`, 404)
	for _, filter := range []struct {
		query   string
		present bool
	}{{"", true}, {"?archived=true", true}, {"?archived=false", false}} {
		var list []handlers.TaraProjectBody
		if err := json.Unmarshal(call(owner, "GET", "/api/v1/projects"+filter.query, "", 200), &list); err != nil {
			t.Fatal(err)
		}
		found := false
		for _, p := range list {
			if p.ID == project.ID {
				found = true
				if p.ArchivedAt == nil {
					t.Fatal("list omitted archive state")
				}
			}
		}
		if found != filter.present {
			t.Fatalf("wrong filter result: %s", filter.query)
		}
	}
	call(owner, "GET", "/api/v1/projects?archived=invalid", "", 422)
	// Membership maintenance stays available; role and last-owner checks still apply.
	var groupMember handlers.ProjectMember
	if err := json.Unmarshal(call(owner, "POST", base+"/members", `{"group_id":"`+teamGroupID+`","role":"EDITOR"}`, 201), &groupMember); err != nil {
		t.Fatal(err)
	}
	call(owner, "DELETE", base+"/members/"+groupMember.ID, "", 204)
	call(owner, "PATCH", base+"/members/"+member.ID, `{"role":"EDITOR"}`, 200)
	call(viewer, "PATCH", base+"/item-definitions/"+item, `{"name":"Blocked editor"}`, 409)
	call(viewer, "POST", base+"/unarchive", "", 403)
	call(viewer, "DELETE", base+"/members/"+member.ID, "", 204)
	call(owner, "POST", base+"/unarchive", "", 200)
	call(owner, "POST", base+"/unarchive", "", 200)
	call(owner, "PATCH", base, `{"name":"Unarchived"}`, 200)
	call(owner, "PATCH", base+"/item-definitions/"+item, `{"name":"Unarchived item"}`, 200)
	call(owner, "PATCH", "/api/v1/item-definitions/"+item+"/attack-paths/"+attack, `{"title":"Unarchived attack"}`, 200)
	call(owner, "PATCH", "/api/v1/threat-scenarios/"+threat+"/risk-values/"+risk, `{"risk_score":4}`, 200)
	var unarchived handlers.TaraProjectBody
	if err := json.Unmarshal(call(owner, "GET", base, "", 200), &unarchived); err != nil {
		t.Fatal(err)
	}
	if unarchived.ArchivedAt != nil {
		t.Fatal("unarchive retained timestamp")
	}
	// An empty archived project remains deletable by its Owner.
	var empty handlers.TaraProjectBody
	if err := json.Unmarshal(call(owner, "POST", "/api/v1/projects", `{"name":"Delete archived"}`, 201), &empty); err != nil {
		t.Fatal(err)
	}
	emptyPath := "/api/v1/projects/" + empty.ID
	call(owner, "POST", emptyPath+"/archive", "", 200)
	call(owner, "DELETE", emptyPath, "", 204)
	call(owner, "GET", emptyPath, "", 404)
}
