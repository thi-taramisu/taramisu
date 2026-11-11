package handlers_test

import (
	"context"
	"crypto/rand"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// TestLastOwnerLockPostgres checks that two Owners cannot downgrade each other at the same time.
// It needs committed rows, because the two changes run on separate connections.
func TestLastOwnerLockPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close) // registered first, so it runs after the cleanups below that use the pool
	store := db.NewStore(pool)

	userID := func() pgtype.UUID {
		t.Helper()
		subject := "lock-test-" + rand.Text()
		raw, err := store.UpsertIAMUser(ctx, subject)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _, _ = pool.Exec(ctx, "DELETE FROM iam_user WHERE external_iam_sub = $1", subject) })
		var id pgtype.UUID
		if err := id.Scan(raw); err != nil {
			t.Fatal(err)
		}
		return id
	}
	alice, bob := userID(), userID()
	project, err := store.CreateTaraProject(ctx, db.CreateTaraProjectParams{Name: "Lock test", OwnerID: alice})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, "DELETE FROM item_definition WHERE tara_project_id = $1", project.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM tara_project WHERE id = $1", project.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM audit_event WHERE tara_project_id = $1", project.ID)
	})
	actor := db.Actor{UserID: alice}
	bobOwner, err := store.CreateUserMember(ctx, db.CreateUserMemberParams{ProjectID: project.ID, UserID: bob, Role: db.ProjectRoleOWNER})
	if err != nil {
		t.Fatal(err)
	}
	members, err := store.ListProjectMembers(ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	var aliceOwner pgtype.UUID
	for _, m := range members {
		if m.UserID == alice {
			aliceOwner = m.ID
		}
	}

	// First change: alice steps down, but her transaction is still open and holds the lock.
	first, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = first.Rollback(ctx) }()
	if _, err := db.NewStore(first).UpdateProjectMemberRole(ctx, actor, db.UpdateProjectMemberRoleParams{
		ProjectID: project.ID, ID: aliceOwner, Role: db.ProjectRoleVIEWER,
	}); err != nil {
		t.Fatalf("first downgrade: %v", err)
	}

	// The lock serializes membership changes only: content of the project can still be written.
	contentCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if _, err := pool.Exec(contentCtx, `INSERT INTO item_definition (tara_project_id, name, scope_type) VALUES ($1, 'Item', 'ITEM')`, project.ID); err != nil {
		t.Fatalf("content write while a membership change holds the lock: %v", err)
	}

	// Second change at the same moment: bob steps down too. It must wait for the first one.
	second := make(chan error, 1)
	go func() {
		_, err := store.UpdateProjectMemberRole(ctx, actor, db.UpdateProjectMemberRoleParams{
			ProjectID: project.ID, ID: bobOwner, Role: db.ProjectRoleVIEWER,
		})
		second <- err
	}()
	select {
	case err := <-second:
		t.Fatalf("second downgrade did not wait for the first one: %v", err)
	case <-time.After(300 * time.Millisecond):
	}
	if err := first.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	// After the first change, bob is the last user Owner, so the guarded update matches no row.
	if err := <-second; !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("second downgrade: %v, want pgx.ErrNoRows (last Owner)", err)
	}
	role, err := store.GetProjectRole(ctx, db.GetProjectRoleParams{ProjectID: project.ID, UserID: bob, GroupIds: []string{}})
	if err != nil || role != db.ProjectRoleOWNER {
		t.Fatalf("bob's role = %q, %v; want OWNER", role, err)
	}

	// The same lock protects removal.
	if _, err := store.DeleteProjectMember(ctx, actor, db.DeleteProjectMemberParams{ProjectID: project.ID, ID: bobOwner}); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("remove last Owner: %v, want pgx.ErrNoRows", err)
	}
}
