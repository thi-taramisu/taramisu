package handlers_test

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

// TestConflictingEditsPostgres checks every operation in versionedOperations: a change based on an
// outdated version is rejected with 412 and the current ETag, changes nothing, and records no audit
// event; the current version (or *) lets it through and raises the version. It runs on the pool, so
// that one change can wait for another one's row lock.
func TestConflictingEditsPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close) // registered first, so it runs after the cleanup below that uses the pool
	store := db.NewStore(pool)
	fixture := authtest.NewFixture(t, store)
	handler := httpapi.New(store, fixture.Manager, httpapi.WithDirectory(&fakeDirectory{}))
	required := httpapi.New(store, fixture.Manager, httpapi.WithDirectory(&fakeDirectory{}), httpapi.WithRequiredIfMatch())
	subject := "conflicting-edits-" + rand.Text()
	token := "Bearer " + fixture.Token(t, map[string]any{"sub": subject})
	var projectID string
	var groupExisted bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM iam_group WHERE external_iam_group_id = $1)`, teamGroupID).Scan(&groupExisted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		bg := context.Background()
		_, _ = pool.Exec(bg, `DELETE FROM item_definition WHERE tara_project_id = $1`, projectID)
		_, _ = pool.Exec(bg, `DELETE FROM tara_project WHERE id = $1`, projectID)
		_, _ = pool.Exec(bg, `DELETE FROM audit_event WHERE tara_project_id = $1`, projectID)
		_, _ = pool.Exec(bg, `DELETE FROM iam_user WHERE external_iam_sub = $1`, subject)
		if !groupExisted {
			_, _ = pool.Exec(bg, `DELETE FROM iam_group WHERE external_iam_group_id = $1`, teamGroupID)
		}
	})

	type response struct {
		status int
		etag   string
		body   map[string]any
	}
	sendTo := func(handler http.Handler, method, path, ifMatch, body string) response {
		req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(ctx)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", token)
		if ifMatch != "" {
			req.Header.Set("If-Match", ifMatch)
		}
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		out := response{status: rr.Code, etag: rr.Header().Get("ETag")}
		if rr.Body.Len() > 0 {
			_ = json.Unmarshal(rr.Body.Bytes(), &out.body)
		}
		return out
	}
	send := func(method, path, ifMatch, body string) response { return sendTo(handler, method, path, ifMatch, body) }
	call := func(method, path, ifMatch, body string, want int) response {
		t.Helper()
		got := send(method, path, ifMatch, body)
		if got.status != want {
			t.Fatalf("%s %s (If-Match %q): status = %d, want %d: %v", method, path, ifMatch, got.status, want, got.body)
		}
		return got
	}
	// version reads the record's version from a response and checks it against the ETag.
	tag := func(version int) string { return strconv.Quote(strconv.Itoa(version)) }
	version := func(r response) int {
		t.Helper()
		v, ok := r.body["version"].(float64)
		if !ok {
			t.Fatalf("response has no version: %v", r.body)
		}
		if r.etag != "" && r.etag != tag(int(v)) {
			t.Fatalf("ETag = %s, but version = %v", r.etag, v)
		}
		return int(v)
	}
	events := func() int {
		t.Helper()
		var n int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM audit_event WHERE tara_project_id = $1`, projectID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	// rejected sends the change with an outdated version and checks that nothing happened.
	rejected := func(method, path, body string, current int, get func() response) {
		t.Helper()
		before, eventsBefore := get(), events()
		got := call(method, path, tag(current+7), body, http.StatusPreconditionFailed)
		if got.etag != tag(current) {
			t.Fatalf("%s %s: 412 with ETag %q, want the current %s", method, path, got.etag, tag(current))
		}
		if after := get(); fmt.Sprint(after.body) != fmt.Sprint(before.body) {
			t.Fatalf("%s %s: rejected change still changed the record: %v, was %v", method, path, after.body, before.body)
		}
		if n := events(); n != eventsBefore {
			t.Fatalf("%s %s: rejected change recorded %d audit events", method, path, n-eventsBefore)
		}
	}

	// Project settings.
	created := call(http.MethodPost, "/api/v1/projects", "", `{"name":"Versions"}`, http.StatusCreated)
	projectID = created.body["id"].(string)
	projectPath := "/api/v1/projects/" + projectID
	getProject := func() response { return call(http.MethodGet, projectPath, "", "", http.StatusOK) }
	if v := version(created); v != 1 {
		t.Fatalf("new project has version %d, want 1", v)
	}
	rejected(http.MethodPatch, projectPath, `{"name":"Lost"}`, 1, getProject)
	rejected(http.MethodPut, projectPath, `{"name":"Lost"}`, 1, getProject)
	if v := version(call(http.MethodPatch, projectPath, tag(1), `{"name":"Renamed"}`, http.StatusOK)); v != 2 {
		t.Fatalf("version after a change = %d, want 2", v)
	}
	if v := version(call(http.MethodPut, projectPath, "*", `{"name":"Replaced"}`, http.StatusOK)); v != 3 {
		t.Fatalf("version after a change with If-Match * = %d, want 3", v)
	}
	// With REQUIRE_IF_MATCH, a change without If-Match is rejected and changes nothing.
	eventsBefore := events()
	if got := sendTo(required, http.MethodPatch, projectPath, "", `{"name":"Lost"}`); got.status != http.StatusPreconditionRequired {
		t.Fatalf("change without If-Match where it is required: status %d, want 428", got.status)
	}
	if got := getProject(); version(got) != 3 || got.body["name"] != "Replaced" || events() != eventsBefore {
		t.Fatalf("rejected change without If-Match still changed the project: %v", got.body)
	}
	// Without it, a change without If-Match is not checked, so that the current frontend can save.
	if v := version(call(http.MethodPatch, projectPath, "", `{"name":"Versions"}`, http.StatusOK)); v != 4 {
		t.Fatalf("version after a change without If-Match = %d, want 4", v)
	}
	// Saving without a change keeps the version, so others who read the project can still change it.
	if v := version(call(http.MethodPatch, projectPath, tag(4), `{"name":"Versions"}`, http.StatusOK)); v != 4 {
		t.Fatalf("version after saving without a change = %d, want 4", v)
	}
	// Archiving changes the project too; archiving it again changes nothing and keeps the version.
	for _, step := range []struct {
		action string
		want   int
	}{{"archive", 5}, {"archive", 5}, {"unarchive", 6}} {
		if v := version(call(http.MethodPost, projectPath+"/"+step.action, "", "", http.StatusOK)); v != step.want {
			t.Fatalf("version after %s = %d, want %d", step.action, v, step.want)
		}
	}

	// Item definitions.
	items := projectPath + "/item-definitions"
	item := items + "/" + call(http.MethodPost, items, "", `{"name":"ECU","scope_type":"ITEM"}`, http.StatusCreated).body["id"].(string)
	getItem := func() response { return call(http.MethodGet, item, "", "", http.StatusOK) }
	rejected(http.MethodPut, item, `{"name":"Lost","scope_type":"ITEM"}`, 1, getItem)
	rejected(http.MethodPatch, item, `{"name":"Lost"}`, 1, getItem)
	rejected(http.MethodDelete, item, "", 1, getItem)
	if v := version(call(http.MethodPut, item, tag(1), `{"name":"ECU","scope_type":"COMPONENT"}`, http.StatusOK)); v != 2 {
		t.Fatalf("item version after a change = %d, want 2", v)
	}

	if v := version(call(http.MethodPatch, item, tag(2), `{"name":"ECU"}`, http.StatusOK)); v != 2 {
		t.Fatalf("item version after saving without a change = %d, want 2", v)
	}

	// A change that waits for another one's row lock compares with the version that the other one
	// committed. If the check ran before taking the lock, the waiting change would overwrite it.
	other, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = other.Rollback(ctx) }()
	var itemID pgtype.UUID
	if err := itemID.Scan(item[strings.LastIndex(item, "/")+1:]); err != nil {
		t.Fatal(err)
	}
	var project pgtype.UUID
	if err := project.Scan(projectID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.New(other).GetItemDefinitionForUpdate(ctx, db.GetItemDefinitionForUpdateParams{ProjectID: project, ID: itemID}); err != nil {
		t.Fatal(err)
	}
	var otherPID int32
	if err := other.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&otherPID); err != nil {
		t.Fatal(err)
	}
	waiting := make(chan response, 1)
	go func() { waiting <- send(http.MethodPatch, item, tag(2), `{"name":"Waiting"}`) }()
	// Wait until the change is really blocked by the lock, not just slow to start.
	for blocked := false; !blocked; {
		select {
		case got := <-waiting:
			t.Fatalf("change did not wait for the row lock: status %d", got.status)
		case <-time.After(20 * time.Millisecond):
		}
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1::integer = ANY (pg_blocking_pids(pid)))`, otherPID).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := other.Exec(ctx, `UPDATE item_definition SET version = version + 1, name = 'Other' WHERE id = $1`, itemID); err != nil {
		t.Fatal(err)
	}
	if err := other.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if got := <-waiting; got.status != http.StatusPreconditionFailed || got.etag != tag(3) {
		t.Fatalf("change based on version 2 after another one committed version 3: status %d, ETag %s; want 412 with %s", got.status, got.etag, tag(3))
	}
	if got := getItem(); version(got) != 3 || got.body["name"] != "Other" {
		t.Fatalf("item after the rejected change: %v, want the other change's version 3", got.body)
	}
	call(http.MethodDelete, item, tag(3), "", http.StatusNoContent)

	// Members.
	members := projectPath + "/members"
	member := members + "/" + call(http.MethodPost, members, "", `{"group_id":"`+teamGroupID+`","role":"VIEWER"}`, http.StatusCreated).body["id"].(string)
	// The member list is a JSON array, which call cannot decode.
	listMember := func() response {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, members, http.NoBody).WithContext(ctx)
		req.Header.Set("Authorization", token)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		var list []map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &list); err != nil {
			t.Fatal(err)
		}
		for _, m := range list {
			if members+"/"+m["id"].(string) == member {
				return response{status: rr.Code, body: m}
			}
		}
		t.Fatalf("member %s not listed", member)
		return response{}
	}
	rejected(http.MethodPatch, member, `{"role":"EDITOR"}`, 1, listMember)
	rejected(http.MethodDelete, member, "", 1, listMember)
	if v := version(call(http.MethodPatch, member, tag(1), `{"role":"EDITOR"}`, http.StatusOK)); v != 2 {
		t.Fatalf("member version after a role change = %d, want 2", v)
	}
	if v := version(call(http.MethodPatch, member, tag(2), `{"role":"EDITOR"}`, http.StatusOK)); v != 2 {
		t.Fatalf("member version after setting the same role = %d, want 2", v)
	}
	call(http.MethodDelete, member, tag(2), "", http.StatusNoContent)

	// Deleting the project.
	rejected(http.MethodDelete, projectPath, "", 6, getProject)
	call(http.MethodDelete, projectPath, tag(6), "", http.StatusNoContent)
}
