package main

import (
	"context"
	"errors"
	"flag"
	"io"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

const (
	projectID = "11111111-1111-4111-8111-111111111111"
	actorID   = "22222222-2222-4222-8222-222222222222"
)

func TestRunRejectsBadInputBeforeConnecting(t *testing.T) {
	for _, tc := range []struct {
		name    string
		args    []string
		url     string
		wantErr error  // nil: any other error, whose text must contain want
		want    string // in the error text, or on stderr for wrong arguments
	}{
		{"no project", []string{"-actor", actorID}, "postgres://x", errUsage, "-project must be"},
		{"bad project", []string{"-project", "nope", "-actor", actorID}, "postgres://x", errUsage, "-project must be"},
		{"no actor", []string{"-project", projectID}, "postgres://x", errUsage, "-actor must be"},
		{"extra argument", []string{"-project", projectID, "-actor", actorID, "now"}, "postgres://x", errUsage, "unexpected argument"},
		{"unknown flag", []string{"-force"}, "postgres://x", errUsage, "not defined"},
		{"help", []string{"-h"}, "postgres://x", flag.ErrHelp, "Usage of restore-project"},
		{"no database", []string{"-project", projectID, "-actor", actorID}, "", nil, "DATABASE_URL is required"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var stderr strings.Builder
			err := run(t.Context(), tc.args, tc.url, io.Discard, &stderr)
			said := stderr.String()
			if tc.wantErr == nil && err != nil {
				said = err.Error()
			}
			if err == nil || (tc.wantErr != nil && !errors.Is(err, tc.wantErr)) || !strings.Contains(said, tc.want) {
				t.Fatalf("error = %v, stderr = %q; want error %v and the text %q", err, stderr.String(), tc.wantErr, tc.want)
			}
		})
	}
}

type fakeRestorer struct {
	actor   db.Actor
	project pgtype.UUID
	err     error
}

func (f *fakeRestorer) RestoreTaraProject(_ context.Context, actor db.Actor, id pgtype.UUID) error {
	f.actor, f.project = actor, id
	return f.err
}

func TestRestoreReportsTheOutcome(t *testing.T) {
	project, actor, err := parseArgs([]string{"-project", projectID, "-actor", actorID}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name    string
		err     error
		wantErr string
		wantOut string
	}{
		{"restored", nil, "", "restored project " + projectID + "\n"},
		{"not deleted", db.ErrProjectNotFound, "does not exist or is not marked as deleted", ""},
		{"unknown actor", db.ErrActorNotFound, "no user with ID " + actorID, ""},
		{"database error", errors.New("database down"), "database down", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeRestorer{err: tc.err}
			var out strings.Builder
			err := restore(t.Context(), store, project, actor, &out)
			if (err == nil) != (tc.wantErr == "") || (err != nil && !strings.Contains(err.Error(), tc.wantErr)) {
				t.Fatalf("error = %v, want %q", err, tc.wantErr)
			}
			if out.String() != tc.wantOut {
				t.Errorf("output = %q, want %q", out.String(), tc.wantOut)
			}
			if store.project.String() != projectID || store.actor.UserID.String() != actorID {
				t.Errorf("restored project %s as %s, want %s as %s", store.project, store.actor.UserID, projectID, actorID)
			}
		})
	}
}
