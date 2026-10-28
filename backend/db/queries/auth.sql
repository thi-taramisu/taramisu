-- name: UpsertIAMUser :one
INSERT INTO iam_user (external_iam_sub)
VALUES ($1)
ON CONFLICT (external_iam_sub)
DO UPDATE SET external_iam_sub = EXCLUDED.external_iam_sub
RETURNING id::text;
