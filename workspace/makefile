export PATH := $(CURDIR)/node_modules/.bin:$(PATH)

.PHONY: help init test test-changed lint workflow-serial-gate workflow-final-gate

help: ## Show the targets and what each one does
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z_-]+:.*## / { printf "  %-22s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

init: ## Install the dependencies
	npm install

test: ## Run every test
	jest

test-changed: ## Run the tests related to the files changed since the last commit (every test when there is no commit)
	@if git rev-parse --verify --quiet HEAD > /dev/null; then \
		jest --onlyChanged; \
	else \
		echo "git cannot read a commit to compare with, so every test runs"; \
		jest; \
	fi

lint: ## Lint the whole project
	eslint .

workflow-serial-gate: lint test-changed ## Run lint and test-changed; gate agents run it between the groups of a flow
	@echo "=== The serial gate is green ==="

workflow-final-gate: lint test ## Run lint and test; a gate agent runs it once, at the end of a flow
	@echo "=== The final gate is green ==="
