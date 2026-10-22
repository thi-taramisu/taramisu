-include .env
export

OPENAPI := openapi.json
COMPOSE := docker compose -f ../deploy/compose.backend.yaml

.PHONY: up down reset db pgadmin run test migrate migrate-diff sqlc openapi
up:
	$(COMPOSE) up --build -d api
down:
	$(COMPOSE) --profile tools down
reset:
	$(COMPOSE) --profile tools down -v
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
openapi:
	@tmp=$$(mktemp "$(OPENAPI).XXXXXX") || exit 1; \
	trap 'rm -f "$$tmp"' EXIT INT TERM; \
	go run ./cmd/openapi > "$$tmp" && mv "$$tmp" $(OPENAPI)
