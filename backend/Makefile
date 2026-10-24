# Compose targets use iam/.env.
ifeq ($(filter up down db reset pgadmin migrate migrate-diff,$(MAKECMDGOALS)),)
-include .env
export
endif

COMPOSE := docker compose --env-file ../iam/.env -f compose.yaml
IAM := docker compose --env-file ../iam/.env -f ../iam/compose.yaml
OPENAPI := openapi.json

.DEFAULT_GOAL := test
.PHONY: up down reset db pgadmin run test migrate migrate-diff sqlc openapi lint fmt
up:
	./dev.sh
down:
	$(COMPOSE) --profile tools down
	$(IAM) down
reset:
	$(COMPOSE) --profile tools down -v
	$(IAM) down -v
db:
	$(COMPOSE) up -d --wait db
pgadmin:
	$(COMPOSE) up -d pgadmin
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
lint:
	golangci-lint run ./...
fmt:
	golangci-lint fmt ./...
openapi:
	@tmp=$$(mktemp "$(OPENAPI).XXXXXX") || exit 1; \
	trap 'rm -f "$$tmp"' EXIT INT TERM; \
	go run ./cmd/openapi > "$$tmp" && mv "$$tmp" $(OPENAPI)
