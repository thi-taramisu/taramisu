# Compose targets use iam/.env.
ifeq ($(filter up down db reset migrate migrate-diff,$(MAKECMDGOALS)),)
-include .env
export
endif

COMPOSE := docker compose --env-file ../iam/.env -f compose.dev.yaml

.DEFAULT_GOAL := test
.PHONY: up down reset db run test migrate migrate-diff sqlc
up:
	./dev.sh
down:
	$(COMPOSE) --profile tools down
reset:
	$(COMPOSE) --profile tools down -v
db:
	$(COMPOSE) up -d --wait db
run:
	go run ./cmd/api
test:
	go test -race ./...
migrate:
	$(COMPOSE) run --rm migrate
migrate-diff:
	$(COMPOSE) up -d --wait dev-db
	$(COMPOSE) run --rm migrate migrate diff "$(name)" --env local
sqlc:
	sqlc generate
