# kube-state-graph-panel — common dev tasks
.DEFAULT_GOAL := help

.PHONY: help install lint typecheck build dev demo demo-down demo-logs server

help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_.-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install npm dependencies
	npm install

lint: ## Run ESLint (same as CI / pre-push)
	npm run lint

typecheck: ## Run TypeScript checker
	npm run typecheck

build: ## Production webpack build → dist/
	npm run build

dev: ## Webpack watch (hot-reload plugin into dist/)
	npm run dev

demo: build ## Build plugin and start Grafana demo stack (detached)
	docker compose up -d --build
	@echo ""
	@echo "Grafana demo: http://localhost:3000  (dashboard: KSG Demo)"
	@echo "Backend API:  http://localhost:8080"
	@echo "Run 'make dev' in another terminal for plugin hot-reload."

demo-down: ## Stop Grafana demo stack
	docker compose down

demo-logs: ## Follow docker compose logs
	docker compose logs -f

server: ## Start demo stack in foreground (blocks; Ctrl+C to stop)
	docker compose up --build
