# ===== Build the frontend SPA files =====
FROM oven/bun:1 AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ .
RUN bun run build

# ===== Build the backend server and also serve the frontend from it =====
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./

RUN uv sync --no-dev --frozen

COPY backend/ .
COPY --from=frontend /app/frontend/dist /app/dist

ENV PRODUCTION=true
ENV AIRLOCK_AGENT_MODEL=gpt-4.1-mini
ENV AIRLOCK_SUSPICION_MODEL=gpt-4.1-mini
ENV AIRLOCK_CLUE_REVEAL_MODEL=gpt-4.1-mini
ENV AIRLOCK_STT_MODEL=whisper-1
ENV AIRLOCK_TTS_MODEL=tts-1

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
