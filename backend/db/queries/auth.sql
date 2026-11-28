-- name: UpsertIAMUser :one
INSERT INTO iam_user (external_iam_sub)
VALUES ($1)
ON CONFLICT (external_iam_sub)
DO UPDATE SET external_iam_sub = EXCLUDED.external_iam_sub
RETURNING id::text;

-- Whether an internal user ID exists; for changes whose actor is not taken from a token.
-- name: IAMUserExists :one
SELECT EXISTS (SELECT 1 FROM iam_user WHERE id = $1);
