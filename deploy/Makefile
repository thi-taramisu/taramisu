COMPOSE := docker compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml

.DEFAULT_GOAL := up
.PHONY: init up down reset db pgadmin migrate migrate-diff migrate-validate seed test test-stack check-networks
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
migrate-validate: init
	$(COMPOSE) run --rm --no-deps migrate migrate validate --dir file://db/migrations
seed: init
	$(COMPOSE) --profile seed run --rm seed
test:
	sh dev_test.sh
test-stack:
	python3 stack_test.py
check-networks:
	./check-networks.sh
