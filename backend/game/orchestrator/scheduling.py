import random
import re

from game.game_state import AGENTS, MAX_TENSION, GameState


def sequence_length(state: GameState) -> int:
    """Number of agent messages in a captain-driven sequence."""
    if state.tension >= 4:
        # Final question before "tension explodes": one message per agent.
        return 3

    # 2–5 messages, biased upward as tension rises.
    t = max(0.0, min(1.0, state.tension / MAX_TENSION))
    base = 2 + round(t * 3)  # 2..5
    jitter = random.choice([-1, 0, 1])
    return max(2, min(5, base + jitter))


def pick_suspected_target(state: GameState, speaker: str, pool: list[str]) -> str:
    """Pick who the speaker is most suspicious of (tie-break randomly)."""
    scored = [(a, float(state.suspicion.get(speaker, {}).get(a, 0.0))) for a in pool]
    if not scored:
        return random.choice(pool)
    best_val = max(v for _, v in scored)
    best = [a for a, v in scored if v == best_val]
    return random.choice(best)


def detect_addressed_agent(content: str) -> str | None:
    """Return agent name if the message directly addresses one (e.g. 'Daisy: ...' or 'Flint, ...')."""
    m = re.match(r"^\s*(daisy|nova|flint)[,:]", content.strip(), re.IGNORECASE)
    return m.group(1).lower() if m else None


def build_schedule(
    state: GameState, captain_content: str, analysis: dict
) -> list[tuple[str, str]]:
    """Build the (speaker, reply_to) schedule for one captain question."""
    # Sequence-based: each captain message triggers 2–5 agent messages.
    # First sequence and CRISIS: exactly one message per agent.
    n = sequence_length(state)
    schedule: list[tuple[str, str]] = []  # (speaker, reply_to)

    if state.tension == 0 or state.tension >= 4:
        speakers = random.sample(AGENTS, k=3)
        for i, speaker in enumerate(speakers):
            reply_to = "captain" if i == 0 else speakers[i - 1]
            schedule.append((speaker, reply_to))
    else:
        prev_speaker: str | None = None
        prev_reply_target: str | None = None

        for i in range(n):
            if i == 0:
                speaker = random.choice(list(AGENTS))
                reply_to = "captain"
            else:
                pool = list(AGENTS)
                weights = []
                for a in pool:
                    w = 1.0
                    # Prefer turn-taking.
                    if prev_speaker and a == prev_speaker:
                        w *= 0.35
                    # Prefer replying to whoever was just addressed.
                    if prev_reply_target and a == prev_reply_target:
                        w *= 1.6
                    weights.append(w)
                speaker = random.choices(pool, weights=weights, k=1)[0]

                if random.random() < 0.8:
                    reply_to = prev_speaker or "captain"
                else:
                    reply_to = pick_suspected_target(
                        state,
                        speaker,
                        [a for a in AGENTS if a != speaker],
                    )

            schedule.append((speaker, reply_to))
            prev_speaker = speaker
            prev_reply_target = reply_to if reply_to in AGENTS else None

    # If the captain directly addressed an agent by name, ensure they speak first.
    addressed = detect_addressed_agent(captain_content)
    if addressed and addressed not in {s for s, _ in schedule}:
        schedule[0] = (addressed, "captain")

    # If the captain contradicted themselves, ensure Nova speaks once.
    if (
        analysis.get("has_contradiction")
        and "nova" not in [s for s, _ in schedule]
        and schedule
    ):
        # Replace the final slot to preserve total message count.
        prev = schedule[-2][0] if len(schedule) >= 2 else "captain"
        schedule[-1] = ("nova", prev)

    return schedule
