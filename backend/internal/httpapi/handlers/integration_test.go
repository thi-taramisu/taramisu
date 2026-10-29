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
	httpapi.New(db.New(pool), db.New(pool), nil).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health/ready", http.NoBody))
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
