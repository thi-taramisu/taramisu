package handlers_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

// TestProjectDeletePostgres follows a project through its deletion: an Owner's delete only marks it,
// which hides it and its content from every member; an operator can restore it; after the grace
// period the cleanup deletes it for good with all its content, and leaves other projects alone.
func TestProjectDeletePostgres(t *testing.T) {
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
	// The purge deletes a project with ON DELETE CASCADE. A foreign key below tara_project without it
	// would pass this test while its table is empty, but make the purge fail for every project with
	// rows in it. Only the treatment decision's reference to a risk value may stay NO ACTION: both
	// are deleted together through the threat scenario. The attachment's reference is SET NULL, so
	// that the attachment cleanup still finds the files of a purged project.
	rows, err := tx.Query(ctx, `
		WITH RECURSIVE below(t) AS (
			SELECT 'tara_project'::regclass
			UNION
			SELECT c.conrelid::regclass FROM pg_constraint c JOIN below ON c.confrelid = below.t WHERE c.contype = 'f'
		)
		SELECT c.conname::text FROM pg_constraint c JOIN below ON c.confrelid = below.t
		WHERE c.contype = 'f' AND c.confdeltype <> 'c' AND c.conname NOT IN ('risk_treatment_decision_risk_threat_fk', 'attachment_project_id_fkey')
		ORDER BY 1`)
	if err != nil {
		t.Fatal(err)
	}
	notCascading, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	if len(notCascading) > 0 {
		t.Fatalf("foreign keys below tara_project without ON DELETE CASCADE: %v", notCascading)
	}

	store := db.NewStore(tx)
	fixture := authtest.NewFixture(t, store)
	handler := httpapi.New(store, fixture.Manager)
	call := func(token, method, path string, want int) string {
		t.Helper()
		req := httptest.NewRequest(method, path, http.NoBody)
		req.Header.Set("Authorization", token)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		return rr.Body.String()
	}

	ownerID, err := store.UpsertIAMUser(ctx, authtest.Subject)
	if err != nil {
		t.Fatal(err)
	}
	owner := "Bearer " + fixture.Token(t, nil)
	ownerActor := db.Actor{UserID: mustUUID(ownerID)}
	newProject := func(name string) (pgtype.UUID, fullItem) {
		t.Helper()
		p, err := store.CreateTaraProject(ctx, db.CreateTaraProjectParams{Name: name, OwnerID: ownerActor.UserID})
		if err != nil {
			t.Fatal(err)
		}
		return p.ID, newFullItem(t, ctx, tx, p.ID.String(), name+" item")
	}
	project, item := newProject("Deleted project")
	other, otherItem := newProject("Other project")
	projectID := project.String()
	editorID, err := store.UpsertIAMUser(ctx, "project-delete-editor")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_role_assignment (tara_project_id, user_id, project_role) VALUES ($1, $2, 'EDITOR')`, projectID, editorID); err != nil {
		t.Fatal(err)
	}
	editor := "Bearer " + fixture.Token(t, map[string]any{"sub": "project-delete-editor"})
	if _, err := store.AddProjectMember(ctx, ownerActor, db.AddProjectMemberParams{ProjectID: project, GroupExternalID: teamGroupID, Role: db.ProjectRoleVIEWER}); err != nil {
		t.Fatal(err)
	}
	groupViewer := "Bearer " + fixture.Token(t, map[string]any{"sub": "project-delete-group-viewer", "taramisu_groups": []string{teamGroupID}})

	// One route per access scope: the project itself, an item definition, and a threat scenario.
	projectPath := "/api/v1/projects/" + projectID
	paths := []string{
		projectPath,
		projectPath + "/members",
		projectPath + "/item-definitions",
		projectPath + "/item-definitions/" + item["item_definition"],
		"/api/v1/item-definitions/" + item["item_definition"] + "/assets",
		"/api/v1/threat-scenarios/" + item["threat_scenario"] + "/risk-values",
	}
	reachable := func(want int) {
		t.Helper()
		for _, token := range []string{owner, editor, groupViewer} {
			for _, path := range paths {
				call(token, http.MethodGet, path, want)
			}
		}
		if listed := strings.Contains(call(owner, http.MethodGet, "/api/v1/projects", http.StatusOK), projectID); listed != (want == http.StatusOK) {
			t.Fatalf("project listed = %v while its routes return %d", listed, want)
		}
	}
	complete := func(item fullItem) {
		t.Helper()
		if got := item.remaining(t, ctx, tx); !reflect.DeepEqual(got, item.tables()) {
			t.Fatalf("rows remain in %v, want all of %v", got, item.tables())
		}
	}
	events := func(want ...string) []storedEvent {
		t.Helper()
		stored := auditEvents(t, ctx, tx, projectID)
		got := make([]string, 0, len(stored))
		for _, e := range stored {
			got = append(got, e.Event+" by "+e.Actor)
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("audit history = %v, want %v", got, want)
		}
		return stored
	}
	added := db.EventMemberAdded + " by " + ownerID
	deletedByOwner := db.EventProjectDeleted + " by " + ownerID

	// Only Owners delete. The deletion marks the project: it is gone for every member, but its
	// content is still stored.
	reachable(http.StatusOK)
	call(editor, http.MethodDelete, projectPath, http.StatusForbidden)
	call(owner, http.MethodDelete, projectPath, http.StatusNoContent)
	reachable(http.StatusNotFound)
	call(owner, http.MethodDelete, projectPath, http.StatusNotFound)
	call(editor, http.MethodDelete, projectPath, http.StatusNotFound) // not 403: the project is gone for members too
	req := httptest.NewRequest(http.MethodPatch, projectPath, strings.NewReader(`{"name":"Renamed"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", owner)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("rename a deleted project: status = %d, want 404: %s", rr.Code, rr.Body.String())
	}
	complete(item)
	events(added, deletedByOwner)

	// An operator restores the project, naming a known user as the actor and themselves as the operator.
	editorActor := db.Actor{UserID: mustUUID(editorID)}
	unknown := db.Actor{UserID: pgtype.UUID{Bytes: [16]byte{0x23, 0x60, 0x01}, Valid: true}}
	if err := store.RestoreTaraProject(ctx, unknown, project, "jane.doe"); !errors.Is(err, db.ErrActorNotFound) {
		t.Fatalf("restore as an unknown user: %v, want ErrActorNotFound", err)
	}
	reachable(http.StatusNotFound)
	if err := store.RestoreTaraProject(ctx, editorActor, project, "jane.doe"); err != nil {
		t.Fatal(err)
	}
	reachable(http.StatusOK)
	complete(item)
	if err := store.RestoreTaraProject(ctx, editorActor, project, "jane.doe"); !errors.Is(err, db.ErrProjectNotFound) {
		t.Fatalf("restore a project that is not deleted: %v, want ErrProjectNotFound", err)
	}
	stored := events(added, deletedByOwner, db.EventProjectRestored+" by "+editorID)
	wantRestored := storedEvent{editorID, db.EventProjectRestored, db.TargetProject, projectID, nil, map[string]any{"name": "Deleted project", "operator": "jane.doe"}, "<NULL>"}
	if !reflect.DeepEqual(stored[2], wantRestored) {
		t.Fatalf("restore event = %+v, want %+v", stored[2], wantRestored)
	}

	// Deleted again, the project is deleted for good once the grace period is over.
	call(owner, http.MethodDelete, projectPath, http.StatusNoContent)
	// A project that cannot be deleted, here because of a row that refers to it, must not hold
	// back the others. The table exists only in this transaction, which the test rolls back.
	blocked, blockedItem := newProject("Blocked project")
	call(owner, http.MethodDelete, "/api/v1/projects/"+blocked.String(), http.StatusNoContent)
	if _, err := tx.Exec(ctx, `CREATE TABLE test_purge_blocker (tara_project_id uuid REFERENCES tara_project (id))`); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO test_purge_blocker VALUES ($1)`, blocked); err != nil {
		t.Fatal(err)
	}
	// purge runs the cleanup and checks whether it deleted the project. It never deletes the other
	// project; projects that other tests left marked in the database are ignored.
	purge := func(cutoff time.Time, wantPurged bool) {
		t.Helper()
		got, err := store.PurgeDeletedProjects(ctx, pgtype.Timestamptz{Time: cutoff, Valid: true})
		if err != nil || slices.Contains(got, project) != wantPurged || slices.Contains(got, other) {
			t.Fatalf("purged projects = %v, %v; want %s purged = %v and %s kept", got, err, project, wantPurged, other)
		}
	}
	// While another replica holds the cleanup lock, this one skips the cleanup. (Once this
	// transaction has taken the lock itself, it keeps it until the test ends, so this comes first.)
	replica, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := replica.Exec(ctx, `SELECT pg_advisory_xact_lock(236001)`); err != nil {
		t.Fatal(err)
	}
	purge(time.Now().Add(time.Hour), false)
	if err := replica.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	purge(time.Now().Add(-time.Hour), false) // still within the grace period
	complete(item)

	got, err := store.PurgeDeletedProjects(ctx, pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true})
	if !slices.Contains(got, project) || slices.Contains(got, blocked) || err == nil || !strings.Contains(err.Error(), blocked.String()) {
		t.Fatalf("purged projects = %v, %v; want %s purged and an error that names %s", got, err, project, blocked)
	}
	complete(blockedItem)
	if _, err := tx.Exec(ctx, `DELETE FROM test_purge_blocker`); err != nil {
		t.Fatal(err)
	}
	if got, err := store.PurgeDeletedProjects(ctx, pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}); err != nil || !slices.Contains(got, blocked) {
		t.Fatalf("purged projects = %v, %v; want %s purged once nothing refers to it", got, err, blocked)
	}
	if got := blockedItem.remaining(t, ctx, tx); len(got) != 0 {
		t.Fatalf("purged project still has rows in %v", got)
	}
	if got := item.remaining(t, ctx, tx); len(got) != 0 {
		t.Fatalf("purged project still has rows in %v", got)
	}
	var left int
	if err := tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM tara_project WHERE id = $1) + (SELECT count(*) FROM project_role_assignment WHERE tara_project_id = $1)`, projectID).Scan(&left); err != nil || left != 0 {
		t.Fatalf("project and role assignment rows left = %d, %v, want 0", left, err)
	}
	complete(otherItem)
	// The purge writes no event; the history outlives the project.
	events(added, deletedByOwner, db.EventProjectRestored+" by "+editorID, deletedByOwner)
}
