# =============================================================================
# Makefile — acdeventkit (nextjs-supabase)
#
# The default database workflow targets the HOSTED Supabase project and needs no
# Docker and no personal access token — only SUPABASE_DB_URL in .env.local.
# Targets prefixed `local-` use the Supabase local stack and do need Docker.
# =============================================================================

.DEFAULT_GOAL := help
NPM_DIR := .

.PHONY: help dev build lint test test-e2e check \
        db-push db-test db-types db-status \
        local-start local-stop local-reset local-status

help: ## Show all commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

## --- application -----------------------------------------------------------

dev: ## Start the Next.js dev server
	npm --prefix $(NPM_DIR) run dev

build: ## Production build
	npm --prefix $(NPM_DIR) run build

lint: ## Run ESLint
	npm --prefix $(NPM_DIR) run lint

test: ## Run Vitest
	npm --prefix $(NPM_DIR) run test --if-present

test-e2e: ## Run Playwright end-to-end tests
	npm --prefix $(NPM_DIR) run test:e2e --if-present

check: ## Format, lint, typecheck, unit tests
	npm --prefix $(NPM_DIR) run check

## --- hosted project (no Docker, no access token) ---------------------------

db-push: ## Apply pending migrations to the hosted project
	npm --prefix $(NPM_DIR) run supabase:push

db-push-dry: ## List pending migrations without applying them
	npm --prefix $(NPM_DIR) run supabase:push -- --dry-run

db-test: ## Run the pgTAP RLS suite against the hosted project
	npm --prefix $(NPM_DIR) run supabase:test

db-types: ## Regenerate src/types/database.types.ts from the hosted project
	npm --prefix $(NPM_DIR) run supabase:types

db-status: ## Show whether the hosted database matches supabase/migrations
	npm --prefix $(NPM_DIR) run supabase:push -- --dry-run

## --- local Supabase stack (requires Docker) --------------------------------

local-start: ## Start the local Supabase stack
	npm --prefix $(NPM_DIR) run supabase:start

local-stop: ## Stop the local Supabase stack
	npm --prefix $(NPM_DIR) run supabase:stop

local-status: ## Show local Supabase stack status
	npm --prefix $(NPM_DIR) run supabase:status

local-reset: ## Recreate the local database from supabase/migrations
	npm --prefix $(NPM_DIR) run supabase:reset
