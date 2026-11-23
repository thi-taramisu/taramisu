-- name: ReplaceProjectTitleImage :one
WITH locked AS (
    SELECT p.id FROM tara_project p WHERE p.id = sqlc.arg(project_id) FOR UPDATE
), image AS (
    INSERT INTO project_title_image (id, content_type, size_bytes, sha256)
    SELECT sqlc.arg(id), sqlc.arg(content_type), sqlc.arg(size_bytes), sqlc.arg(sha256) FROM locked
    RETURNING *
), changed AS (
    UPDATE tara_project SET title_image_id = image.id FROM image
    WHERE tara_project.id = sqlc.arg(project_id) RETURNING title_image_id
)
SELECT image.* FROM image JOIN changed ON changed.title_image_id = image.id;

-- name: GetProjectTitleImage :one
SELECT image.* FROM project_title_image image
JOIN tara_project p ON p.title_image_id = image.id WHERE p.id = $1;

-- name: ClearProjectTitleImage :execrows
UPDATE tara_project SET title_image_id = NULL WHERE id = $1;

-- name: ListOrphanedProjectTitleImages :many
SELECT image.* FROM project_title_image image
WHERE NOT EXISTS (SELECT 1 FROM tara_project p WHERE p.title_image_id = image.id)
AND image.id > $1 ORDER BY image.id LIMIT 100;

-- name: DeleteOrphanedProjectTitleImage :exec
DELETE FROM project_title_image image WHERE image.id = $1
AND NOT EXISTS (SELECT 1 FROM tara_project p WHERE p.title_image_id = image.id);
