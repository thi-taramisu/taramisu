package handlers_test

import (
	"context"
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
	httpapi.New(db.New(pool)).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health/ready", http.NoBody))
	if rr.Code != http.StatusOK {
		t.Fatalf("readiness failed: %d %s", rr.Code, rr.Body.String())
	}
}
