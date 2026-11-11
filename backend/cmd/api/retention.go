package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// How often the API deletes expired audit history, and how soon it tries again after a failure.
const (
	auditCleanupInterval = 24 * time.Hour
	auditCleanupRetry    = time.Hour
)

type auditEventPurger interface {
	PurgeExpiredAuditEvents(context.Context, pgtype.Timestamptz) (int64, error)
}

// purgeAuditEvents deletes the audit history of projects deleted more than retention ago, once at
// start and then every interval (after a failure: every retry), until ctx is cancelled
// (docs/internal/architecture/audit.md). Every replica runs this loop; an advisory lock in the store
// lets only one of them delete at a time.
func purgeAuditEvents(ctx context.Context, store auditEventPurger, retention, interval, retry time.Duration) {
	for ctx.Err() == nil {
		cutoff := pgtype.Timestamptz{Time: time.Now().Add(-retention), Valid: true}
		deleted, err := store.PurgeExpiredAuditEvents(ctx, cutoff)
		next := interval
		switch {
		case err != nil && ctx.Err() == nil:
			slog.ErrorContext(ctx, "audit retention cleanup failed", "error", err, "retry_in", retry.String())
			next = retry
		case deleted > 0:
			slog.InfoContext(ctx, "audit retention cleanup", "deleted_events", deleted)
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
