import asyncio
import random
import re
from dataclasses import dataclass
from typing import Awaitable, Callable

from agents.daisy import Daisy
from agents.flint import Flint
from agents.nova import Nova

from game.game_state import GameState


_agents = {
    "daisy": Daisy(),
    "nova": Nova(),
    "flint": Flint(),
}

# Match whitespace following sentence-ending punctuation for TTS chunking.
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


@dataclass
class AgentCallbacks:
    send_typing: Callable[[str], Awaitable[None]]
    send_stream_start: Callable[[str], Awaitable[None]]
    send_stream_token: Callable[[str, str], Awaitable[None]]
    send_stream_end: Callable[[str, str], Awaitable[None]]  # agent, full_text
    send_stream_audio: Callable[[str, str], Awaitable[None]]  # agent, sentence_text
    broadcast: Callable[[dict], Awaitable[None]]


async def stream_agent(
    agent_name: str,
    state: GameState,
    cb: AgentCallbacks,
    *,
    pre_delay: float = 0.0,
    contradiction_callout: str | None = None,
) -> str:
    """Stream one agent response. Returns the full assembled text."""
    if pre_delay:
        await asyncio.sleep(pre_delay)

    await cb.send_typing(agent_name)
    await asyncio.sleep(random.uniform(0.25, 0.6))

    if contradiction_callout and agent_name == "nova":
        state.add_message(
            "__meta__",
            f"[Nova notices a contradiction: {contradiction_callout}. They should call it out specifically.]",
        )

    await cb.send_stream_start(agent_name)

    tokens: list[str] = []
    sentence_chars: list[str] = []

    try:
        async for token in _agents[agent_name].stream(state):
            tokens.append(token)
            await cb.send_stream_token(agent_name, token)

            sentence_chars.append(token)
            acc = "".join(sentence_chars)
            parts = _SENTENCE_RE.split(acc)
            if len(parts) > 1:
                for part in parts[:-1]:
                    sentence = part.strip()
                    if sentence:
                        await cb.send_stream_audio(agent_name, sentence)
                sentence_chars = list(parts[-1])
    except Exception as e:
        print(f"[{agent_name}] stream error: {e!r}")
        if not tokens:
            await cb.send_stream_token(agent_name, "...")
            tokens = ["..."]

    remaining = "".join(sentence_chars).strip()
    if remaining:
        await cb.send_stream_audio(agent_name, remaining)

    full_text = "".join(tokens).strip()

    state.chat_history = [
        m for m in state.chat_history if not m.speaker.startswith("__")
    ]
    state.add_message(agent_name, full_text)

    await cb.send_stream_end(agent_name, full_text)
    return full_text
