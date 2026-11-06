package httpapi

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// RunCleanup resumes persisted deletions at startup and every minute. Multiple
// API replicas may process the same row: both S3 and metadata deletes are idempotent.
func (h *Attachments) RunCleanup(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		if err := h.cleanupPending(ctx); err != nil && ctx.Err() == nil {
			slog.Error("scan pending attachment deletions", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (h *Attachments) cleanupPending(ctx context.Context) error {
	cursor := pgtype.UUID{Valid: true}
	for {
		rows, err := h.queries.ListPendingAttachmentDeletions(ctx, cursor)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		for _, a := range rows {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			attemptCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err = h.finishDeletion(attemptCtx, a)
			cancel()
			if err != nil {
				slog.Warn("retry attachment deletion", "id", uuid.UUID(a.ID.Bytes).String(), "error", err)
			}
			// Advance even on failure, so one unavailable object cannot starve later rows.
			cursor = a.ID
		}
	}
}

func (h *Attachments) finishDeletion(ctx context.Context, a db.Attachment) error {
	if err := h.objects.Delete(ctx, uuid.UUID(a.S3ObjectKey.Bytes).String()); err != nil {
		return err
	}
	return h.queries.DeleteAttachment(ctx, db.DeleteAttachmentParams{ProjectID: a.ProjectID, ID: a.ID})
}
