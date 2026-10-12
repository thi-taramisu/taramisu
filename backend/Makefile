-include .env
export

.PHONY: db run test migrate migrate-diff
db:
	docker compose up -d --wait db
run:
	go run ./cmd/api
test:
	go test -race ./...
migrate:
	docker compose run --rm migrate
migrate-diff:
	docker compose up -d --wait dev-db
	docker compose run --rm migrate migrate diff "$(name)" --env local
