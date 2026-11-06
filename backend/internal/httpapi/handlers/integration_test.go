package handlers_test

import (
	"context"
	"crypto/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

func TestPostgresReadiness(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	rr := httptest.NewRecorder()
	httpapi.New(db.New(pool), nil).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health/ready", http.NoBody))
	if rr.Code != http.StatusOK {
		t.Fatalf("readiness failed: %d %s", rr.Code, rr.Body.String())
	}
}

func TestIAMUserMapping(t *testing.T) {
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
	queries := db.New(tx)
	subject := "test-" + rand.Text()
	first, err := queries.UpsertIAMUser(ctx, subject)
	if err != nil || first == "" {
		t.Fatalf("create user: %q %v", first, err)
	}
	again, err := queries.UpsertIAMUser(ctx, subject)
	if err != nil || again != first {
		t.Fatalf("repeat login changed user ID: %q %v", again, err)
	}
	other, err := queries.UpsertIAMUser(ctx, "test-"+rand.Text())
	if err != nil || other == first {
		t.Fatalf("different subject reused user ID: %q %v", other, err)
	}
}

func TestIAMUserSubjectPreservationWithRoleAssignment(t *testing.T) {
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
		_ = tx.Rollback(ctx)
	}()
	queries := db.New(tx)

	// An existing user with Authentik's default hashed_user_id subject format (64-char sha256).
	existingSub := "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"
	initialUserID, err := queries.UpsertIAMUser(ctx, existingSub)
	if err != nil || initialUserID == "" {
		t.Fatalf("failed to create initial user: %v", err)
	}

	// Create project and assign role to the user.
	var projectID string
	err = tx.QueryRow(ctx, "INSERT INTO tara_project (name) VALUES ('Test Project') RETURNING id::text").Scan(&projectID)
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}
	_, err = tx.Exec(ctx, "INSERT INTO project_role_assignment (tara_project_id, user_id, project_role) VALUES ($1::uuid, $2::uuid, 'OWNER')", projectID, initialUserID)
	if err != nil {
		t.Fatalf("failed to assign project role: %v", err)
	}

	// Re-authenticating with the preserved subject format must return the same internal user ID.
	resumedUserID, err := queries.UpsertIAMUser(ctx, existingSub)
	if err != nil {
		t.Fatalf("UpsertIAMUser on re-auth failed: %v", err)
	}
	if resumedUserID != initialUserID {
		t.Fatalf("internal user ID changed from %s to %s", initialUserID, resumedUserID)
	}

	// Verify project role assignment remains attached to the returned user ID.
	var role string
	err = tx.QueryRow(ctx, "SELECT project_role::text FROM project_role_assignment WHERE tara_project_id = $1::uuid AND user_id = $2::uuid", projectID, resumedUserID).Scan(&role)
	if err != nil || role != "OWNER" {
		t.Fatalf("expected role OWNER for user ID %s, got role %q, err %v", resumedUserID, role, err)
	}
}
