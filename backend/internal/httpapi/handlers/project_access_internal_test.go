package handlers

import (
	"errors"
	"net/http"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestProjectOf(t *testing.T) {
	var statusErr huma.StatusError
	if _, err := projectOf(pgtype.UUID{}, pgx.ErrNoRows); !errors.As(err, &statusErr) || statusErr.GetStatus() != http.StatusNotFound {
		t.Fatalf("unknown parent: %v, want 404", err)
	}
	other := errors.New("database down")
	if _, err := projectOf(pgtype.UUID{}, other); !errors.Is(err, other) {
		t.Fatalf("other errors must pass through: %v", err)
	}
	id := pgtype.UUID{Valid: true}
	if got, err := projectOf(id, nil); err != nil || got != id {
		t.Fatalf("found parent: %v, %v", got, err)
	}
}
