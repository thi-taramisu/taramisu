package db_test

import (
	"context"
	"crypto/rand"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

func TestAttachmentPersistence(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to a migrated PostgreSQL test database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := db.New(tx)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, e := tx.Exec(ctx, sql, args...); e != nil {
			t.Fatal(e)
		}
	}
	id := func(sql string, args ...any) pgtype.UUID {
		t.Helper()
		var value pgtype.UUID
		if e := tx.QueryRow(ctx, sql, args...).Scan(&value); e != nil {
			t.Fatal(e)
		}
		return value
	}
	user := id("INSERT INTO iam_user(external_iam_sub) VALUES($1) RETURNING id", rand.Text())
	project := id("INSERT INTO tara_project(name) VALUES('attachments test') RETURNING id")
	otherProject := id("INSERT INTO tara_project(name) VALUES('other project') RETURNING id")

	input := db.CreateAttachmentParams{ProjectID: project, UploadedBy: user, FileName: "report.txt", ContentType: "text/plain", SizeBytes: 10 << 20, Sha256: strings.Repeat("a", 64), S3ObjectKey: id("SELECT gen_random_uuid()")}
	attachment, err := queries.CreateAttachment(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if !attachment.ID.Valid || !attachment.CreatedAt.Valid || attachment.DeletePending || attachment.SizeBytes != input.SizeBytes || attachment.Sha256 != input.Sha256 {
		t.Fatalf("incorrect persisted metadata: %+v", attachment)
	}
	if _, err = queries.GetAttachment(ctx, db.GetAttachmentParams{ProjectID: otherProject, ID: attachment.ID}); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("cross-project lookup: %v", err)
	}
	rows, err := queries.ListAttachments(ctx, db.ListAttachmentsParams{ProjectID: project, Limit: 1})
	if err != nil || len(rows) != 1 {
		t.Fatalf("list: %v %v", rows, err)
	}
	rows, err = queries.ListAttachments(ctx, db.ListAttachmentsParams{ProjectID: project, Limit: 1, Offset: 1})
	if err != nil || len(rows) != 0 {
		t.Fatalf("pagination: %v %v", rows, err)
	}

	// A savepoint lets each rejected write exercise real constraints without aborting the fixture.
	for _, test := range []struct {
		name, sql, code string
		args            []any
	}{
		{"empty name", "UPDATE attachment SET file_name='' WHERE id=$1", "23514", []any{attachment.ID}},
		{"long name", "UPDATE attachment SET file_name=repeat('a',256) WHERE id=$1", "23514", []any{attachment.ID}},
		{"empty file", "UPDATE attachment SET size_bytes=0 WHERE id=$1", "23514", []any{attachment.ID}},
		{"oversized file", "UPDATE attachment SET size_bytes=10485761 WHERE id=$1", "23514", []any{attachment.ID}},
		{"invalid hash", "UPDATE attachment SET sha256='invalid' WHERE id=$1", "23514", []any{attachment.ID}},
		{"missing project", "UPDATE attachment SET project_id=gen_random_uuid() WHERE id=$1", "23503", []any{attachment.ID}},
		{"delete project", "DELETE FROM tara_project WHERE id=$1", "23503", []any{project}},
		{"delete uploader", "DELETE FROM iam_user WHERE id=$1", "23503", []any{user}},
	} {
		t.Run(test.name, func(t *testing.T) {
			exec("SAVEPOINT constraint_check")
			_, e := tx.Exec(ctx, test.sql, test.args...)
			var pgErr *pgconn.PgError
			if !errors.As(e, &pgErr) || pgErr.Code != test.code {
				t.Errorf("expected SQLSTATE %s, got %v", test.code, e)
			}
			exec("ROLLBACK TO SAVEPOINT constraint_check")
			exec("RELEASE SAVEPOINT constraint_check")
		})
	}
	exec("SAVEPOINT duplicate_key")
	if _, err = queries.CreateAttachment(ctx, input); err == nil {
		t.Error("duplicate storage key accepted")
	}
	exec("ROLLBACK TO SAVEPOINT duplicate_key")
	exec("RELEASE SAVEPOINT duplicate_key")

	deletion := db.DeleteAttachmentParams{ProjectID: project, ID: attachment.ID}
	if err = queries.DeleteAttachment(ctx, deletion); err != nil {
		t.Fatal(err)
	}
	if _, err = queries.GetAttachment(ctx, db.GetAttachmentParams{ProjectID: project, ID: attachment.ID}); err != nil {
		t.Fatalf("unmarked attachment was deleted: %v", err)
	}
	affected, err := queries.MarkAttachmentDeleting(ctx, db.MarkAttachmentDeletingParams{ProjectID: otherProject, ID: attachment.ID})
	if err != nil || affected != 0 {
		t.Fatalf("cross-project deletion: %d %v", affected, err)
	}
	affected, err = queries.MarkAttachmentDeleting(ctx, db.MarkAttachmentDeletingParams{ProjectID: project, ID: attachment.ID})
	if err != nil || affected != 1 {
		t.Fatalf("mark deletion: %d %v", affected, err)
	}
	rows, err = queries.ListAttachments(ctx, db.ListAttachmentsParams{ProjectID: project, Limit: 100})
	if err != nil || len(rows) != 0 {
		t.Fatalf("pending attachment listed: %v %v", rows, err)
	}
	rows, err = queries.ListPendingAttachmentDeletions(ctx, pgtype.UUID{Valid: true})
	if err != nil || len(rows) != 1 || rows[0].ID != attachment.ID || !rows[0].DeletePending {
		t.Fatalf("cleanup queue: %v %v", rows, err)
	}
	rows, err = queries.ListPendingAttachmentDeletions(ctx, attachment.ID)
	if err != nil || len(rows) != 0 {
		t.Fatalf("cleanup cursor did not advance: %v %v", rows, err)
	}
	for range 2 {
		if err = queries.DeleteAttachment(ctx, deletion); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = queries.GetAttachment(ctx, db.GetAttachmentParams{ProjectID: project, ID: attachment.ID}); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("deleted metadata still available: %v", err)
	}
	exec("DELETE FROM tara_project WHERE id=$1", project)
	exec("DELETE FROM iam_user WHERE id=$1", user)
}
