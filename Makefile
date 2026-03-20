SHELL := /bin/sh

.PHONY: setup reset-secrets demo-setup demo-reset

setup:
	./scripts/bootstrap-env.sh

reset-secrets:
	rm -f .env
	./scripts/bootstrap-env.sh

demo-setup:
	./scripts/bootstrap-demo-env.sh

demo-reset:
	./scripts/reset-local-demo.sh
