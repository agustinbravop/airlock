import random
import time
from dataclasses import dataclass, field
from typing import Optional

AGENTS = ["daisy", "nova", "flint"]

MAX_TENSION = 5


@dataclass
class ChatMessage:
    speaker: str
    content: str
    timestamp: float


@dataclass
class GameState:
    traitor: str = field(default_factory=lambda: random.choice(AGENTS))
    chat_history: list[ChatMessage] = field(default_factory=list)
    suspicion: dict[str, dict[str, float]] = field(
        default_factory=lambda: {
            "daisy": {"nova": 0.2, "flint": 0.3, "player": 0.1},
            "nova": {"daisy": 0.2, "flint": 0.4, "player": 0.1},
            "flint": {"daisy": 0.2, "nova": 0.3, "player": 0.1},
        }
    )
    # Tension is the turn counter: starts at 0 and increments by 1 after each captain sequence.
    # At MAX_TENSION the captain can no longer ask questions (must eject).
    tension: int = 0
    game_over: bool = False
    ejected: Optional[str] = None

    # Pacing
    start_time: float = field(default_factory=time.time)
    last_message_time: float = field(default_factory=time.time)
    agent_message_count: int = 0
    is_responding: bool = False

    # Per-agent emotional state (injected into prompts)
    emotional_state: dict[str, str] = field(
        default_factory=lambda: {
            "daisy": "anxious",
            "nova": "analytical",
            "flint": "confident",
        }
    )

    # Alibis generated at game start; traitor's has a planted flaw
    alibis: dict[str, str] = field(default_factory=dict)

    # Factual claims stated by each agent (for contradiction detection)
    stated_facts: dict[str, list[str]] = field(
        default_factory=lambda: {a: [] for a in AGENTS}
    )

    @property
    def elapsed(self) -> float:
        return time.time() - self.start_time

    def add_message(self, speaker: str, content: str):
        self.chat_history.append(
            ChatMessage(speaker=speaker, content=content, timestamp=time.time())
        )
        self.last_message_time = time.time()
        if speaker in AGENTS:
            self.agent_message_count += 1
            self.stated_facts[speaker].append(content)
            if len(self.stated_facts[speaker]) > 10:
                self.stated_facts[speaker] = self.stated_facts[speaker][-10:]

    def format_history(self, last_n: int = 20) -> str:
        recent = self.chat_history[-last_n:]
        lines = []
        for m in recent:
            if m.speaker.startswith("__"):
                lines.append(m.content)
            else:
                label = "PLAYER" if m.speaker == "player" else m.speaker.upper()
                lines.append(f"[{label}]: {m.content}")
        return "\n".join(lines)

    def update_suspicion(self, from_agent: str, target: str, delta: float):
        if from_agent in self.suspicion and target in self.suspicion[from_agent]:
            current = self.suspicion[from_agent][target]
            self.suspicion[from_agent][target] = max(0.0, min(1.0, current + delta))

    def suspicion_snapshot(self) -> dict:
        """Serialisable version of the suspicion matrix."""
        return {k: dict(v) for k, v in self.suspicion.items()}
