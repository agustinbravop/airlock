set shell := ["bash", "-cu"]

# Run backend + frontend concurrently
dev:
    trap 'kill 0' EXIT; (cd backend && source .venv/bin/activate && AIRLOCK_AGENT_MODEL=gpt-4.1-nano AIRLOCK_SUSPICION_MODEL=gpt-4.1-nano AIRLOCK_CLUE_REVEAL_MODEL=gpt-4.1-nano python server.py) & (cd frontend && bun run dev)

# Install all dependencies
install:
    cd backend && uv venv && uv pip install -r requirements.txt
    cd frontend && bun install

# Lint code (backend + frontend). May modify files.
lint:
    cd backend && source .venv/bin/activate && python -m ruff format .
    cd backend && source .venv/bin/activate && python -m ruff check .
    cd frontend && bunx --bun prettier --write .
    cd frontend && bunx --bun eslint . --fix
    cd frontend && bunx --bun tsc --noEmit

# Copy root .env to backend/ then install — run this once after cloning
setup:
    test -f backend/.env || (cp .env backend/.env && echo "Copied .env → backend/.env")
    just install

# Backend only
backend:
    cd backend && source .venv/bin/activate && python server.py

# Frontend only
frontend:
    cd frontend && bun run dev
