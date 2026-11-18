package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// How often the API runs its cleanup jobs, and how soon it tries again after a failure.
const (
	cleanupInterval = 24 * time.Hour
	cleanupRetry    = time.Hour
)

// runCleanup calls cleanup once at start and then every interval (after a failure: every retry),
// until ctx is cancelled. Every replica runs this loop; an advisory lock in the store lets only one
// of them do the work at a time.
func runCleanup(ctx context.Context, job string, cleanup func(context.Context) error, interval, retry time.Duration) {
	for ctx.Err() == nil {
		next := interval
		if err := cleanup(ctx); err != nil && ctx.Err() == nil {
			slog.ErrorContext(ctx, "cleanup failed", "job", job, "error", err, "retry_in", retry.String())
			next = retry
		}
		timer := time.NewTimer(next)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

type auditEventPurger interface {
	PurgeExpiredAuditEvents(context.Context, pgtype.Timestamptz) (int64, error)
}

// purgeAuditEvents returns the cleanup that deletes the audit history of projects whose deletion was
// requested more than retention ago and that are deleted for good
// (docs/internal/architecture/audit.md).
func purgeAuditEvents(store auditEventPurger, retention time.Duration) func(context.Context) error {
	return func(ctx context.Context) error {
		deleted, err := store.PurgeExpiredAuditEvents(ctx, cutoff(retention))
		if err == nil && deleted > 0 {
			slog.InfoContext(ctx, "audit retention cleanup", "deleted_events", deleted)
		}
		return err
	}
}

type deletedProjectPurger interface {
	PurgeDeletedProjects(context.Context, pgtype.Timestamptz) ([]pgtype.UUID, error)
}

// purgeDeletedProjects returns the cleanup that deletes projects for good once they have been marked
// as deleted for longer than grace. This writes no audit event, only a log line with the project
// IDs: the deletion was recorded when it was requested.
func purgeDeletedProjects(store deletedProjectPurger, grace time.Duration) func(context.Context) error {
	return func(ctx context.Context) error {
		ids, err := store.PurgeDeletedProjects(ctx, cutoff(grace))
		if err == nil && len(ids) > 0 {
			projects := make([]string, len(ids))
			for i, id := range ids {
				projects[i] = id.String()
			}
			slog.InfoContext(ctx, "deleted projects purged", "count", len(ids), "projects", projects)
		}
		return err
	}
}

func cutoff(age time.Duration) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: time.Now().Add(-age), Valid: true}
}
