"""Centralized model selection.

All defaults match `implementation-notes.md`. Override per-environment via env vars.
"""

from __future__ import annotations

import os


def _env(name: str, default: str) -> str:
    val = os.getenv(name)
    return val.strip() if val and val.strip() else default


# Chat models
AGENT_MODEL = _env("AIRLOCK_AGENT_MODEL", "gpt-4.1-mini")
SUSPICION_MODEL = _env("AIRLOCK_SUSPICION_MODEL", "gpt-4.1-mini")
CLUE_REVEAL_MODEL = _env("AIRLOCK_CLUE_REVEAL_MODEL", "gpt-4.1-mini")

# Audio models
STT_MODEL = _env("AIRLOCK_STT_MODEL", "whisper-1")
TTS_MODEL = _env("AIRLOCK_TTS_MODEL", "tts-1")
