package handlers_test

import (
	"context"
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
	if logLines[2]["before_role"] != "VIEWER" || logLines[2]["after_role"] != "OWNER" {
		t.Errorf("role change log line = %v, want before_role VIEWER and after_role OWNER", logLines[2])
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
