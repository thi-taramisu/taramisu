package handlers_test

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
	"github.com/thi-taramisu/taramisu/backend/internal/logging"
)

// storedEvent is an audit_event row as the tests compare it. Before and After are nil for SQL NULL;
// RequestID is "<NULL>" for SQL NULL.
type storedEvent struct {
	Actor, Event, TargetType, Target string
	Before, After                    any
	RequestID                        string
}

// auditEvents returns the project's audit history in the order it was written.
func auditEvents(t *testing.T, ctx context.Context, q db.DBTX, projectID string) []storedEvent {
	t.Helper()
	rows, err := q.Query(ctx, `
		SELECT actor_user_id::text, event, target_type, target_id::text, before, after, coalesce(request_id, '<NULL>')
		FROM audit_event WHERE tara_project_id = $1 ORDER BY occurred_at, id`, projectID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var events []storedEvent
	for rows.Next() {
		var e storedEvent
		var before, after []byte
		if err := rows.Scan(&e.Actor, &e.Event, &e.TargetType, &e.Target, &before, &after, &e.RequestID); err != nil {
			t.Fatal(err)
		}
		for _, field := range []struct {
			raw []byte
			dst *any
		}{{before, &e.Before}, {after, &e.After}} {
			switch {
			case field.raw == nil: // SQL NULL stays nil
			case string(field.raw) == "null":
				*field.dst = "JSON null" // must never be written; makes such a row fail the comparison
			default:
				if err := json.Unmarshal(field.raw, field.dst); err != nil {
					t.Fatal(err)
				}
			}
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return events
}

// TestAuditHistoryPostgres checks that every event of the "Audit" section in
// docs/internal/architecture/iam/project-roles.md is stored with the change, and that rejected
// changes store nothing.
func TestAuditHistoryPostgres(t *testing.T) {
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
	store := db.NewStore(tx)
	fixture := authtest.NewFixture(t, store)
	handler := httpapi.New(store, fixture.Manager, httpapi.WithDirectory(&fakeDirectory{}))
	alice := "Bearer " + fixture.Token(t, nil)
	bob := "Bearer " + fixture.Token(t, map[string]any{"sub": "new-sub"})

	call := func(token, method, path, body string, want int) []byte {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", token)
		req.Header.Set(logging.RequestIDHeader, "req-"+method)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		return rr.Body.Bytes()
	}
	idOf := func(sql, arg string) string {
		t.Helper()
		var id string
		if err := tx.QueryRow(ctx, sql, arg).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}

	decode := func(data []byte, target any) {
		t.Helper()
		if err := json.Unmarshal(data, target); err != nil {
			t.Fatal(err)
		}
	}

	// The project name stands for confidential project data: it may be stored, but never logged.
	const projectName = "Secret ECU"
	var project handlers.TaraProjectBody
	var aliceMember, bobMember, teamMember handlers.ProjectMember
	logLines := captureLog(t, "audit", func() {
		decode(call(alice, http.MethodPost, "/api/v1/projects", `{"name":"`+projectName+`","description":"Contact: x@example.com"}`, http.StatusCreated), &project)
		members := "/api/v1/projects/" + project.ID + "/members"
		var list []handlers.ProjectMember
		decode(call(alice, http.MethodGet, members, "", http.StatusOK), &list)
		aliceMember = list[0]
		call(alice, http.MethodPatch, members+"/"+aliceMember.ID, `{"role":"EDITOR"}`, http.StatusConflict) // last user Owner
		decode(call(alice, http.MethodPost, members, `{"email":"new@example.com","role":"VIEWER"}`, http.StatusCreated), &bobMember)
		decode(call(alice, http.MethodPost, members, `{"group_id":"`+teamGroupID+`","role":"EDITOR"}`, http.StatusCreated), &teamMember)
		call(alice, http.MethodPost, members, `{"email":"new@example.com","role":"EDITOR"}`, http.StatusConflict) // already a member
		call(bob, http.MethodDelete, members+"/"+teamMember.ID, "", http.StatusForbidden)                         // Viewers remove only themselves
		call(alice, http.MethodPatch, members+"/"+bobMember.ID, `{"role":"OWNER"}`, http.StatusOK)
		call(alice, http.MethodPatch, members+"/"+bobMember.ID, `{"role":"OWNER"}`, http.StatusOK) // unchanged
		call(bob, http.MethodDelete, members+"/"+teamMember.ID, "", http.StatusNoContent)
		call(alice, http.MethodPatch, members+"/"+bobMember.ID, `{"role":"VIEWER"}`, http.StatusOK)
		call(bob, http.MethodDelete, members+"/"+bobMember.ID, "", http.StatusNoContent) // bob leaves
		call(alice, http.MethodDelete, "/api/v1/projects/"+project.ID, "", http.StatusNoContent)
	})

	aliceID := idOf(`SELECT id::text FROM iam_user WHERE external_iam_sub = $1`, authtest.Subject)
	bobID := idOf(`SELECT id::text FROM iam_user WHERE external_iam_sub = $1`, "new-sub")
	teamID := idOf(`SELECT id::text FROM iam_group WHERE external_iam_group_id = $1`, teamGroupID)
	bobAs := func(role string) map[string]any { return map[string]any{"role": role, "user_id": bobID} }
	deleted := map[string]any{
		"name":    projectName,
		"members": []any{map[string]any{"id": aliceMember.ID, "role": "OWNER", "user_id": aliceID}},
	}
	want := []storedEvent{
		{aliceID, "project.created", db.TargetProject, project.ID, nil, map[string]any{"name": projectName, "first_owner": aliceID}, "req-POST"},
		{aliceID, db.EventMemberAdded, db.TargetProjectMember, bobMember.ID, nil, bobAs("VIEWER"), "req-POST"},
		{aliceID, db.EventMemberAdded, db.TargetProjectMember, teamMember.ID, nil, map[string]any{"role": "EDITOR", "group_id": teamID}, "req-POST"},
		{aliceID, db.EventMemberRoleChanged, db.TargetProjectMember, bobMember.ID, bobAs("VIEWER"), bobAs("OWNER"), "req-PATCH"},
		{bobID, db.EventMemberRemoved, db.TargetProjectMember, teamMember.ID, map[string]any{"role": "EDITOR", "group_id": teamID}, nil, "req-DELETE"},
		{aliceID, db.EventMemberRoleChanged, db.TargetProjectMember, bobMember.ID, bobAs("OWNER"), bobAs("VIEWER"), "req-PATCH"},
		{bobID, db.EventMemberRemoved, db.TargetProjectMember, bobMember.ID, bobAs("VIEWER"), nil, "req-DELETE"},
		{aliceID, db.EventProjectDeleted, db.TargetProject, project.ID, deleted, nil, "req-DELETE"},
	}
	// The events outlive the deleted project and its assignments.
	if got := auditEvents(t, ctx, tx, project.ID); !reflect.DeepEqual(got, want) {
		t.Fatalf("audit history:\n got %+v\nwant %+v", got, want)
	}

	// Each stored event is also logged, with IDs and roles only.
	if len(logLines) != len(want) {
		t.Fatalf("got %d audit log lines, want %d: %v", len(logLines), len(want), logLines)
	}
	for i, line := range logLines {
		if line["event"] != want[i].Event || line["actor"] != want[i].Actor || line["target"] != want[i].Target || line["project"] != project.ID {
			t.Errorf("log line %d = %v, want %s of %s by %s", i, line, want[i].Event, want[i].Target, want[i].Actor)
		}
		if text := fmt.Sprint(line); strings.Contains(text, projectName) || strings.Contains(text, "@") {
			t.Errorf("log line %d contains project data or an email address: %v", i, line)
		}
	}
	if logLines[3]["before_role"] != "VIEWER" || logLines[3]["after_role"] != "OWNER" {
		t.Errorf("role change log line = %v, want before_role VIEWER and after_role OWNER", logLines[3])
	}
}

// TestAuditRetentionPostgres checks that a project deletion that fails leaves no
// event, and that the retention cleanup removes the history of deleted projects only.
func TestAuditRetentionPostgres(t *testing.T) {
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
	defer func() { _ = tx.Rollback(ctx) }()
	store := db.NewStore(tx)
	userID, err := store.UpsertIAMUser(ctx, authtest.Subject)
	if err != nil {
		t.Fatal(err)
	}
	actor := db.Actor{UserID: mustUUID(userID)}
	newProject := func(name string) pgtype.UUID {
		t.Helper()
		p, err := store.CreateTaraProject(ctx, db.CreateTaraProjectParams{Name: name, OwnerID: actor.UserID})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := store.AddProjectMember(ctx, actor, db.AddProjectMemberParams{ProjectID: p.ID, GroupExternalID: teamGroupID, Role: db.ProjectRoleVIEWER}); err != nil {
			t.Fatal(err)
		}
		return p.ID
	}
	kept, deleted := newProject("kept"), newProject("deleted")

	// A project with item definitions cannot be deleted; the failed deletion stores no event.
	if _, err := tx.Exec(ctx, `INSERT INTO item_definition (tara_project_id, name, scope_type) VALUES ($1, 'Item', 'ITEM')`, kept); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteTaraProject(ctx, actor, kept); err == nil {
		t.Fatal("deleting a project with item definitions succeeded")
	}
	if err := store.DeleteTaraProject(ctx, actor, deleted); err != nil {
		t.Fatal(err)
	}
	if got := auditEvents(t, ctx, tx, kept.String()); len(got) != 1 || got[0].Event != db.EventMemberAdded {
		t.Fatalf("history of the kept project = %+v, want only member.added", got)
	}

	// A change to a project that does not exist stores nothing and says so.
	missing := pgtype.UUID{Bytes: [16]byte{0x21, 0x80, 0x01}, Valid: true}
	if _, err := store.AddProjectMember(ctx, actor, db.AddProjectMemberParams{ProjectID: missing, GroupExternalID: teamGroupID, Role: db.ProjectRoleVIEWER}); !errors.Is(err, db.ErrProjectNotFound) {
		t.Fatalf("add member to a missing project: %v, want ErrProjectNotFound", err)
	}

	purge := func(cutoff time.Time) {
		t.Helper()
		if _, err := store.PurgeExpiredAuditEvents(ctx, pgtype.Timestamptz{Time: cutoff, Valid: true}); err != nil {
			t.Fatal(err)
		}
	}

	// While another replica holds the cleanup lock, this one skips the cleanup. (Once this
	// transaction has taken the lock itself, it keeps it until the test ends, so this comes first.)
	other, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := other.Exec(ctx, `SELECT pg_advisory_xact_lock(218001)`); err != nil {
		t.Fatal(err)
	}
	purge(time.Now().Add(time.Hour))
	if err := other.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if got := auditEvents(t, ctx, tx, deleted.String()); len(got) != 2 {
		t.Fatalf("history after a cleanup that another replica blocked = %+v, want 2 events", got)
	}

	// Within the retention period nothing is removed.
	purge(time.Now().Add(-time.Hour))
	if got := auditEvents(t, ctx, tx, deleted.String()); len(got) != 2 {
		t.Fatalf("history of the deleted project before expiry = %+v, want 2 events", got)
	}

	// After the retention period, the deleted project's history is gone.
	purge(time.Now().Add(time.Hour))
	if got := auditEvents(t, ctx, tx, deleted.String()); len(got) != 0 {
		t.Fatalf("history of the deleted project after expiry = %+v, want none", got)
	}
	if got := auditEvents(t, ctx, tx, kept.String()); len(got) != 1 {
		t.Fatalf("history of the kept project after cleanup = %+v, want it unchanged", got)
	}
}

// failAfterChange runs each audited change and then fails, as a later step of a request could. The
// change must then be rolled back with its event; a query that escaped the transaction would persist.
type failAfterChange struct{ *db.Store }

var errInjected = errors.New("injected failure after the change")

func (f failAfterChange) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return f.Store.Audit(ctx, actor, func(ctx context.Context) (db.Change, error) {
		if _, err := change(ctx); err != nil {
			return db.Change{}, err
		}
		return db.Change{}, errInjected
	})
}

// TestAuditContentPostgres checks the events written through the generic entry point (db.Store.Audit):
// project settings and item definitions, and that every operation in auditedOperations writes an
// event. It runs on the pool with committed transactions, as in production.
func TestAuditContentPostgres(t *testing.T) {
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
	t.Cleanup(pool.Close) // registered first, so it runs after the cleanups below that use the pool
	store := db.NewStore(pool)
	fixture := authtest.NewFixture(t, store)
	handler := httpapi.New(store, fixture.Manager, httpapi.WithDirectory(&fakeDirectory{}))
	failing := httpapi.New(failAfterChange{store}, fixture.Manager)
	subject := "audit-content-" + rand.Text()
	rolledBackName := "Rolled back " + subject // unique per run, so a leaked row cannot fail later runs
	token := "Bearer " + fixture.Token(t, map[string]any{"sub": subject})
	var projectIDs []any
	var groupExisted bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM iam_group WHERE external_iam_group_id = $1)`, teamGroupID).Scan(&groupExisted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		bg := context.Background()
		for _, id := range projectIDs {
			_, _ = pool.Exec(bg, `DELETE FROM item_definition WHERE tara_project_id = $1`, id)
			_, _ = pool.Exec(bg, `DELETE FROM tara_project WHERE id = $1`, id)
			_, _ = pool.Exec(bg, `DELETE FROM audit_event WHERE tara_project_id = $1`, id)
		}
		_, _ = pool.Exec(bg, `DELETE FROM audit_event WHERE tara_project_id IN (SELECT id FROM tara_project WHERE name = $1)`, rolledBackName)
		_, _ = pool.Exec(bg, `DELETE FROM item_definition WHERE name = $1`, rolledBackName)
		_, _ = pool.Exec(bg, `DELETE FROM tara_project WHERE name = $1`, rolledBackName)
		_, _ = pool.Exec(bg, `DELETE FROM iam_user WHERE external_iam_sub = $1`, subject)
		if !groupExisted {
			_, _ = pool.Exec(bg, `DELETE FROM iam_group WHERE external_iam_group_id = $1`, teamGroupID)
		}
	})
	// serve sends a request whose request ID is the operation ID, so the stored events show which
	// operation wrote them.
	serve := func(h http.Handler, operation, method, path, body string, want int) map[string]any {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(ctx)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", token)
		req.Header.Set(logging.RequestIDHeader, operation)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		var out map[string]any
		if rr.Body.Len() > 0 {
			if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
				t.Fatal(err)
			}
		}
		return out
	}
	call := func(operation, method, path, body string, want int) map[string]any {
		t.Helper()
		return serve(handler, operation, method, path, body, want)
	}
	newProject := func(name string) (map[string]any, string) {
		t.Helper()
		p := call("create-tara-project", http.MethodPost, "/api/v1/projects", `{"name":"`+name+`"}`, http.StatusCreated)
		projectIDs = append(projectIDs, p["id"])
		return p, "/api/v1/projects/" + p["id"].(string)
	}

	project, projectPath := newProject("Lamp")
	call("update-tara-project", http.MethodPatch, projectPath, `{"name":"Headlamp"}`, http.StatusOK)
	call("replace-tara-project", http.MethodPut, projectPath, `{"name":"Headlamp","description":"Contact: x@example.com"}`, http.StatusOK)
	call("update-tara-project", http.MethodPatch, projectPath, `{"name":"Headlamp"}`, http.StatusOK) // unchanged

	items := projectPath + "/item-definitions"
	created := call("create-item-definition", http.MethodPost, items, `{"name":"Lamp ECU","scope_type":"ITEM","boundary":"CAN"}`, http.StatusCreated)
	item := items + "/" + created["id"].(string)
	replaced := call("replace-item-definition", http.MethodPut, item, `{"name":"Lamp ECU","scope_type":"COMPONENT"}`, http.StatusOK)
	call("update-item-definition", http.MethodPatch, item, `{"scope_type":"COMPONENT"}`, http.StatusOK) // unchanged
	patched := call("update-item-definition", http.MethodPatch, item, `{"functions":"Low beam"}`, http.StatusOK)
	call("delete-item-definition", http.MethodDelete, item, "", http.StatusNoContent)
	call("delete-item-definition", http.MethodDelete, item, "", http.StatusNotFound)

	var userID string
	if err := pool.QueryRow(ctx, `SELECT id::text FROM iam_user WHERE external_iam_sub = $1`, subject).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	projectID := project["id"].(string)
	want := []storedEvent{
		{userID, "project.created", db.TargetProject, projectID, nil, map[string]any{"name": "Lamp", "first_owner": userID}, "create-tara-project"},
		{userID, "project.updated", db.TargetProject, projectID, map[string]any{"name": "Lamp"}, map[string]any{"name": "Headlamp"}, "update-tara-project"},
		{userID, "project.updated", db.TargetProject, projectID, map[string]any{"name": "Headlamp"}, map[string]any{"name": "Headlamp", "description_changed": true}, "replace-tara-project"},
		{userID, "item_definition.created", db.TargetItemDefinition, created["id"].(string), nil, created, "create-item-definition"},
		{userID, "item_definition.updated", db.TargetItemDefinition, created["id"].(string), created, replaced, "replace-item-definition"},
		{userID, "item_definition.updated", db.TargetItemDefinition, created["id"].(string), replaced, patched, "update-item-definition"},
		{userID, "item_definition.deleted", db.TargetItemDefinition, created["id"].(string), patched, nil, "delete-item-definition"},
	}
	if got := auditEvents(t, ctx, pool, projectID); !reflect.DeepEqual(got, want) {
		t.Fatalf("audit history:\n got %+v\nwant %+v", got, want)
	}

	// Every operation declared as audited writes an event.
	members := projectPath + "/members"
	team := call("add-project-member", http.MethodPost, members, `{"group_id":"`+teamGroupID+`","role":"VIEWER"}`, http.StatusCreated)
	call("update-project-member", http.MethodPatch, members+"/"+team["id"].(string), `{"role":"EDITOR"}`, http.StatusOK)
	call("remove-project-member", http.MethodDelete, members+"/"+team["id"].(string), "", http.StatusNoContent)
	call("delete-tara-project", http.MethodDelete, projectPath, "", http.StatusNoContent)
	written := map[string]bool{}
	for _, e := range auditEvents(t, ctx, pool, projectID) {
		written[e.RequestID] = true
		if strings.Contains(fmt.Sprint(e), "@") {
			t.Errorf("event stores the project description: %+v", e)
		}
	}
	for _, operation := range auditedOperations {
		if !written[operation] {
			t.Errorf("%s is listed in auditedOperations but wrote no event", operation)
		}
	}

	// A change whose request fails afterwards is rolled back with its event. A query that escaped the
	// transaction of Audit would persist and fail these checks.
	other, otherPath := newProject("Other")
	otherItem := call("create-item-definition", http.MethodPost, otherPath+"/item-definitions", `{"name":"Kept","scope_type":"ITEM"}`, http.StatusCreated)
	otherItemPath := otherPath + "/item-definitions/" + otherItem["id"].(string)
	before := auditEvents(t, ctx, pool, other["id"].(string))
	name := `"name":"` + rolledBackName + `"`
	rollbacks := []struct{ operation, method, path, body string }{
		{"create-tara-project", http.MethodPost, "/api/v1/projects", `{` + name + `}`},
		{"update-tara-project", http.MethodPatch, otherPath, `{` + name + `}`},
		{"replace-tara-project", http.MethodPut, otherPath, `{` + name + `}`},
		{"create-item-definition", http.MethodPost, otherPath + "/item-definitions", `{` + name + `,"scope_type":"ITEM"}`},
		{"replace-item-definition", http.MethodPut, otherItemPath, `{` + name + `,"scope_type":"ITEM"}`},
		{"update-item-definition", http.MethodPatch, otherItemPath, `{` + name + `}`},
		{"delete-item-definition", http.MethodDelete, otherItemPath, ""},
	}
	// Membership changes and project deletion run in db.Store methods, not through handlers.Auditor,
	// so the wrapper cannot reach them; TestAuditHistoryPostgres covers their rejected changes.
	storeMethods := map[string]bool{"add-project-member": true, "update-project-member": true, "remove-project-member": true, "delete-tara-project": true}
	covered := map[string]bool{}
	for _, r := range rollbacks {
		// The 500 must come from the injected failure after the change, not from an earlier error.
		logged := captureLog(t, "unexpected error", func() {
			serve(failing, r.operation, r.method, r.path, r.body, http.StatusInternalServerError)
		})
		if len(logged) != 1 || !strings.Contains(fmt.Sprint(logged[0]["error"]), errInjected.Error()) {
			t.Errorf("%s: logged %v, want the injected failure", r.operation, logged)
		}
		covered[r.operation] = true
	}
	for _, operation := range auditedOperations {
		if !storeMethods[operation] && !covered[operation] {
			t.Errorf("%s is audited through handlers.Auditor but has no case in the rollback list", operation)
		}
	}
	var projects, rolledBackItems int
	var kept string
	if err := pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM tara_project WHERE name = $2),
		       (SELECT count(*) FROM item_definition WHERE name = $2),
		       coalesce((SELECT name FROM item_definition WHERE id = $1), 'deleted')`, otherItem["id"], rolledBackName).Scan(&projects, &rolledBackItems, &kept); err != nil {
		t.Fatal(err)
	}
	if projects != 0 || rolledBackItems != 0 || kept != "Kept" {
		t.Errorf("after failed requests: %d projects and %d item definitions renamed, item is %q; want 0, 0, Kept", projects, rolledBackItems, kept)
	}
	if got := auditEvents(t, ctx, pool, other["id"].(string)); !reflect.DeepEqual(got, before) {
		t.Errorf("failed requests changed the audit history: %+v", got)
	}
	if got := call("get-tara-project", http.MethodGet, otherPath, "", http.StatusOK); got["name"] != "Other" {
		t.Errorf("project name after failed changes = %v, want Other", got["name"])
	}

	// A locking read outside Audit's transaction is refused: its lock would end with the statement.
	if _, err := store.GetItemDefinitionForUpdate(ctx, db.GetItemDefinitionForUpdateParams{
		ProjectID: mustUUID(other["id"].(string)), ID: mustUUID(otherItem["id"].(string)),
	}); !errors.Is(err, db.ErrLockOutsideTransaction) {
		t.Fatalf("locking read outside Audit = %v, want ErrLockOutsideTransaction", err)
	}

	// Audit cannot be nested: the inner event would be logged before the outer change is committed.
	err = store.Audit(ctx, db.Actor{UserID: mustUUID(userID)}, func(ctx context.Context) (db.Change, error) {
		_, err := store.AddProjectMember(ctx, db.Actor{UserID: mustUUID(userID)}, db.AddProjectMemberParams{
			ProjectID: mustUUID(other["id"].(string)), GroupExternalID: teamGroupID, Role: db.ProjectRoleVIEWER,
		})
		return db.Change{}, err
	})
	if !errors.Is(err, db.ErrNestedAudit) {
		t.Fatalf("nested Audit = %v, want ErrNestedAudit", err)
	}
}
