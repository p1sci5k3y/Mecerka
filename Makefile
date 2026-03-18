SHELL := /bin/sh

.PHONY: setup reset-secrets

setup:
	./scripts/bootstrap-env.sh

reset-secrets:
	rm -f .env
	./scripts/bootstrap-env.sh
