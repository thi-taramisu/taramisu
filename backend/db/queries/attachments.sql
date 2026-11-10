-- name: CreateAttachment :one
INSERT INTO attachment (project_id, file_name, content_type, size_bytes, sha256, s3_object_key, uploaded_by)
VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;

-- name: ListAttachments :many
SELECT * FROM attachment WHERE project_id = $1 AND NOT delete_pending ORDER BY created_at, id LIMIT $2 OFFSET $3;

-- name: GetAttachment :one
SELECT * FROM attachment WHERE project_id = $1 AND id = $2;

-- name: DeleteAttachment :exec
DELETE FROM attachment WHERE project_id = $1 AND id = $2 AND delete_pending;

-- name: MarkAttachmentDeleting :execrows
UPDATE attachment SET delete_pending = true WHERE project_id = $1 AND id = $2;

-- name: ListPendingAttachmentDeletions :many
SELECT * FROM attachment WHERE delete_pending AND id > $1 ORDER BY id LIMIT 100;
