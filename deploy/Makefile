COMPOSE := docker compose --env-file ../iam/.env -f compose.yaml

.DEFAULT_GOAL := up
.PHONY: init up down reset db pgadmin migrate migrate-diff test
init:
	./dev.sh --init
up:
	./dev.sh
down:
	$(COMPOSE) --profile tools down
reset:
	$(COMPOSE) --profile tools down -v
db: init
	$(COMPOSE) up -d --wait db
pgadmin: init
	$(COMPOSE) up -d pgadmin
migrate: init
	$(COMPOSE) run --rm migrate
migrate-diff: init
	$(COMPOSE) up -d --wait dev-db
	$(COMPOSE) run --rm migrate migrate diff "$(name)" --env local
test:
	sh dev_test.sh
