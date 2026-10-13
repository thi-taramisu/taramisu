-- name: GetServiceStatus :one
SELECT message FROM service_status WHERE id = true;
