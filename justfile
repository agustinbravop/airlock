set shell := ["bash", "-cu"]

# Run backend + frontend concurrently
dev:
    trap 'kill 0' EXIT; (cd backend && source .venv/bin/activate && uv run server.py) & (cd frontend && bun run dev)

# Install all dependencies
install:
    cd backend && uv sync --dev
    cd frontend && bun install

# Lint code (backend + frontend). May modify files.
lint:
    cd backend && source .venv/bin/activate && uv run ruff format .
    cd backend && source .venv/bin/activate && uv run ruff check --fix .
    cd frontend && bunx --bun prettier --write .
    cd frontend && bunx --bun eslint . --fix
    cd frontend && bunx --bun tsc --noEmit

# Copy root .env to backend/ then install — run this once after cloning
setup:
    test -f backend/.env || (cp .env backend/.env && echo "Copied .env → backend/.env")
    just install

# Backend only
backend:
    cd backend && source .venv/bin/activate && uv run server.py

# Frontend only
frontend:
    cd frontend && bun run dev
