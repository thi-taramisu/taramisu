# Compose targets use iam/.env.
ifeq ($(filter init up down db reset pgadmin migrate migrate-diff,$(MAKECMDGOALS)),)
-include .env
export
endif

OPENAPI := openapi.json

.DEFAULT_GOAL := test
.PHONY: init up down reset db pgadmin run test migrate migrate-diff sqlc openapi lint fmt
init up down reset db pgadmin migrate migrate-diff:
	$(MAKE) -C ../deploy $@
run:
	go run ./cmd/api
test:
	go test -race ./...
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
