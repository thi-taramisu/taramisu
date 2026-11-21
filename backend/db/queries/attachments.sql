-- name: CreateAttachment :one
INSERT INTO attachment (project_id, item_definition_id, file_name, content_type, size_bytes, sha256, s3_object_key, uploaded_by)
VALUES (sqlc.arg(project_id), sqlc.narg(item_definition_id), sqlc.arg(file_name), sqlc.arg(content_type),
        sqlc.arg(size_bytes), sqlc.arg(sha256), sqlc.arg(s3_object_key), sqlc.arg(uploaded_by))
RETURNING *;

-- name: ListAttachments :many
SELECT * FROM attachment
WHERE project_id = sqlc.arg(project_id)
  AND item_definition_id IS NOT DISTINCT FROM sqlc.narg(item_definition_id)::uuid
  AND NOT delete_pending
ORDER BY created_at, id LIMIT sqlc.arg('limit') OFFSET sqlc.arg('offset');

-- name: GetAttachment :one
SELECT * FROM attachment
WHERE project_id = sqlc.arg(project_id) AND id = sqlc.arg(id)
  AND item_definition_id IS NOT DISTINCT FROM sqlc.narg(item_definition_id)::uuid;

-- name: DeleteAttachment :exec
DELETE FROM attachment WHERE id = $1 AND (delete_pending OR project_id IS NULL);

-- name: MarkAttachmentDeleting :execrows
UPDATE attachment SET delete_pending = true
WHERE project_id = sqlc.arg(project_id) AND id = sqlc.arg(id)
  AND item_definition_id IS NOT DISTINCT FROM sqlc.narg(item_definition_id)::uuid;

-- name: ListPendingAttachmentDeletions :many
SELECT * FROM attachment WHERE (delete_pending OR project_id IS NULL) AND id > $1 ORDER BY id LIMIT 100;
