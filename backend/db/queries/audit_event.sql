-- Audit history (docs/internal/architecture/audit.md). Rows are only inserted, and deleted by the
-- retention cleanup; nothing updates them.
-- name: InsertAuditEvent :exec
INSERT INTO audit_event (tara_project_id, actor_user_id, event, target_type, target_id, before, after, request_id)
VALUES (sqlc.arg(project_id), sqlc.arg(actor_user_id), sqlc.arg(event), sqlc.arg(target_type), sqlc.arg(target_id),
        sqlc.narg(before), sqlc.narg(after), sqlc.narg(request_id));

-- Lets one replica at a time run the retention cleanup; released when the transaction ends.
-- name: TryAuditRetentionLock :one
SELECT pg_try_advisory_xact_lock(218001);

-- Deletes all events of projects that were deleted before the cutoff.
-- name: DeleteExpiredAuditEvents :execrows
DELETE FROM audit_event
WHERE tara_project_id IN (
    SELECT deleted.tara_project_id FROM audit_event deleted
    WHERE deleted.event = 'project.deleted' AND deleted.occurred_at < sqlc.arg(cutoff)::timestamptz
);
