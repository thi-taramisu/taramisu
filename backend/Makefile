# up/down use iam/.env.
ifeq ($(filter up down,$(MAKECMDGOALS)),)
-include .env
export
endif

.DEFAULT_GOAL := test
.PHONY: up down reset db run test migrate migrate-diff sqlc
up:
	../iam/dev.sh
down:
	docker compose --env-file ../iam/.env -f ../iam/compose.yaml --profile tools down
reset:
	docker compose --profile tools down -v
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
sqlc:
	sqlc generate
