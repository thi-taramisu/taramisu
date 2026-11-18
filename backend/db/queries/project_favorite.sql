-- Personal project favourites (#232). Both statements are idempotent.

-- name: AddProjectFavorite :exec
INSERT INTO project_favorite (user_id, tara_project_id)
VALUES (sqlc.arg(user_id), sqlc.arg(project_id))
ON CONFLICT DO NOTHING;

-- name: RemoveProjectFavorite :exec
DELETE FROM project_favorite
WHERE user_id = sqlc.arg(user_id) AND tara_project_id = sqlc.arg(project_id);

-- name: IsProjectFavorite :one
SELECT EXISTS (
    SELECT 1 FROM project_favorite
    WHERE user_id = sqlc.arg(user_id) AND tara_project_id = sqlc.arg(project_id)
);
