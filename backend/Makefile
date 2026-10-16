-include .env
export

.PHONY: up down reset db run test migrate migrate-diff sqlc lint fmt
up:
	docker compose up --build -d api
down:
	docker compose --profile tools down
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
lint:
	golangci-lint run ./...
fmt:
	golangci-lint fmt ./...
