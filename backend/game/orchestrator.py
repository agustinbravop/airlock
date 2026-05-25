"""
Orchestrator: drives all agent activity — player responses, autonomous ticks,
second-chance ejection, and post-game clue reveal.
"""

import asyncio
import json
import random
from dataclasses import dataclass
from typing import Awaitable, Callable

import llm_settings
from agents.daisy import Daisy
from agents.flint import Flint
from agents.nova import Nova
from openai import AsyncOpenAI

from game.game_state import AGENTS, MAX_TENSION, GameState
from game.suspicion_engine import (
    process_message,
    process_messages_batch,
    update_emotional_states,
)

_agents = {
    "daisy": Daisy(),
    "nova": Nova(),
    "flint": Flint(),
}


@dataclass
class AgentCallbacks:
    send_typing: Callable[[str], Awaitable[None]]
    send_stream_start: Callable[[str], Awaitable[None]]
    send_stream_token: Callable[[str, str], Awaitable[None]]
    send_stream_end: Callable[[str, str], Awaitable[None]]  # agent, full_text (for TTS)
    broadcast: Callable[[dict], Awaitable[None]]


def _sequence_length(state: GameState) -> int:
    """Number of agent messages in a captain-driven sequence."""
    if state.tension >= 4:
        # Final question before "tension explodes": one message per agent.
        return 3

    # 2–5 messages, biased upward as tension rises.
    t = max(0.0, min(1.0, state.tension / MAX_TENSION))
    base = 2 + round(t * 3)  # 2..5
    jitter = random.choice([-1, 0, 1])
    return max(2, min(5, base + jitter))


def _pick_suspected_target(state: GameState, speaker: str, pool: list[str]) -> str:
    """Pick who the speaker is most suspicious of (tie-break randomly)."""
    scored = [(a, float(state.suspicion.get(speaker, {}).get(a, 0.0))) for a in pool]
    if not scored:
        return random.choice(pool)
    best_val = max(v for _, v in scored)
    best = [a for a, v in scored if v == best_val]
    return random.choice(best)


def _pick_highest_suspicion_pair(state: GameState) -> tuple[str, str]:
    best, best_val = ("flint", "nova"), 0.0
    for frm in AGENTS:
        for tgt, val in state.suspicion.get(frm, {}).items():
            if tgt in AGENTS and tgt != frm and val > best_val:
                best_val = val
                best = (frm, tgt)
    return best


async def _stream_agent(
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
    async for token in _agents[agent_name].stream(state):
        tokens.append(token)
        await cb.send_stream_token(agent_name, token)

    full_text = "".join(tokens).strip()

    state.chat_history = [
        m for m in state.chat_history if not m.speaker.startswith("__")
    ]
    state.add_message(agent_name, full_text)

    await cb.send_stream_end(agent_name, full_text)

    return full_text


async def handle_player_message(
    content: str,
    state: GameState,
    cb: AgentCallbacks,
):
    # Exchange-based pacing: while agents are responding, the crew is "busy"
    # and won't accept another captain message.
    if state.is_responding:
        return
    state.is_responding = True
    try:
        # Hard cap: 5 captain questions (tension 0..4). At 5, captain must eject.
        if state.tension >= MAX_TENSION:
            await cb.broadcast(
                {
                    "type": "system_message",
                    "content": "Tension has peaked. No more questions. Eject a suspect now.",
                }
            )
            return

        state.add_message("player", content)
        analysis = await process_message(state, "player", content)

        await cb.broadcast(
            {
                "type": "suspicion_update",
                "matrix": state.suspicion_snapshot(),
                "emotional_state": dict(state.emotional_state),
            }
        )

        # Sequence-based: each captain message triggers 2–5 agent messages.
        # First sequence and CRISIS: exactly one message per agent.
        n = _sequence_length(state)
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
                        reply_to = _pick_suspected_target(
                            state,
                            speaker,
                            [a for a in AGENTS if a != speaker],
                        )

                schedule.append((speaker, reply_to))
                prev_speaker = speaker
                prev_reply_target = reply_to if reply_to in AGENTS else None

        # If the captain contradicted themselves, ensure Nova speaks once.
        contradiction_detail = ""
        if analysis.get("has_contradiction"):
            contradiction_detail = analysis.get("contradiction_detail", "")
            if "nova" not in [s for s, _ in schedule] and schedule:
                # Replace the final slot to preserve total message count.
                prev = schedule[-2][0] if len(schedule) >= 2 else "captain"
                schedule[-1] = ("nova", prev)

        # Collect agent outputs so we can batch suspicion classification once.
        agent_outputs: list[tuple[str, str]] = []

        for i, (agent_name, reply_to) in enumerate(schedule):
            pre = random.uniform(0.6, 1.5) if i == 0 else random.uniform(0.1, 0.3)
            if reply_to == "captain":
                state.add_message(
                    "__meta__",
                    f'[{agent_name.capitalize()} is responding directly to the Captain\'s question: "{content}". Keep it short.]',
                )
            else:
                state.add_message(
                    "__meta__",
                    f'[{agent_name.capitalize()} must respond to the Captain\'s question: "{content}". You may also react to what {reply_to.capitalize()} just said, or tackle both topics at the same time.]',
                )
            out = await _stream_agent(
                agent_name,
                state,
                cb,
                pre_delay=pre,
                contradiction_callout=contradiction_detail
                if agent_name == "nova"
                else None,
            )
            agent_outputs.append((agent_name, out))

        # Batch-apply suspicion changes for the whole sequence (one LLM call).
        await process_messages_batch(state, agent_outputs)

        # Broadcast suspicion update once after the sequence.
        await cb.broadcast(
            {
                "type": "suspicion_update",
                "matrix": state.suspicion_snapshot(),
                "emotional_state": dict(state.emotional_state),
            }
        )

        # One full sequence completed: increment tension.
        state.tension = min(MAX_TENSION, state.tension + 1)
        update_emotional_states(state)

        await cb.broadcast(
            {
                "type": "tension_update",
                "tension": state.tension,
                "tension_max": MAX_TENSION,
            }
        )

        if state.tension >= MAX_TENSION:
            await cb.broadcast(
                {
                    "type": "system_message",
                    "content": "CRISIS: Tension has exploded. Eject a suspect now.",
                }
            )

        # Explicitly hand control back to the captain after each sequence.
        await cb.broadcast(
            {
                "type": "system_message",
                "content": "Crew waiting for Captain.",
            }
        )

    finally:
        state.is_responding = False


async def autonomous_tick(state: GameState, cb: AgentCallbacks):
    # No autonomous chatter in this game mode.
    return


async def autonomous_loop(
    state_getter: Callable[[], GameState],
    cb: AgentCallbacks,
):
    # No autonomous loop in this game mode.
    return


async def generate_clue_reveal(state: GameState) -> list[dict]:
    """Post-game: find 3–5 moments in the chat that pointed to the traitor."""
    history = state.format_history(last_n=60)
    traitor = state.traitor
    prompt = f"""You are reviewing a murder mystery deduction game that just ended.
The traitor was: {traitor.capitalize()}
Sarah was killed by the traitor.

Full conversation:
{history}

Identify 3–5 specific moments from this conversation that were genuine clues pointing to {traitor.capitalize()} as the killer.
Look for: deflections, suspicious redirections, alibi inconsistencies, overly eager accusations, defensive overreactions, or convenient re-framings.

Return a JSON array:
[{{"speaker": "...", "quote": "exact quote or close paraphrase", "clue": "one sentence explaining why this was suspicious"}}]
Return ONLY the JSON array."""

    try:
        client = AsyncOpenAI()
        response = await client.chat.completions.create(
            model=llm_settings.CLUE_REVEAL_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        print(f"Clue reveal failed: {e}")
        return []


async def handle_eject(
    target: str,
    state: GameState,
    cb: AgentCallbacks,
) -> dict:
    correct = target == state.traitor
    is_second_chance = state.wrong_eject is not None

    if not correct and not is_second_chance:
        # First wrong eject: enter second-chance mode, game continues
        state.wrong_eject = target

        survivors = [a for a in AGENTS if a != target]
        for agent_name in survivors:
            await asyncio.sleep(random.uniform(0.5, 1.0))
            state.add_message(
                "__meta__",
                f"[{target.capitalize()} was just ejected but they were INNOCENT. "
                f"The traitor is still here and now feels emboldened. React with shock or fear. Be urgent.]",
            )
            await _stream_agent(agent_name, state, cb)

        # Traitor gets ultra-aggressive instructions injected next turn
        state.raise_tension(0.3)
        update_emotional_states(state)

        return {
            "type": "wrong_eject",
            "ejected": target,
            "traitor": state.traitor,
            "suspicion_matrix": state.suspicion_snapshot(),
        }

    # Final ejection (correct first, correct second, or wrong second)
    state.game_over = True
    state.ejected = target
    won = correct

    # Surviving agents react
    survivors = [a for a in AGENTS if a != target]
    for agent_name in survivors:
        await asyncio.sleep(random.uniform(0.4, 1.0))
        verdict = "correct" if won else "wrong"
        state.add_message(
            "__meta__",
            f"[The crew just ejected {target.capitalize()}. The ejection was {verdict}. "
            f"{'The traitor has been found.' if won else 'An innocent person was ejected — the traitor wins.'} React briefly in character.]",
        )
        await _stream_agent(agent_name, state, cb)

    clues = await generate_clue_reveal(state)

    return {
        "type": "game_over",
        "ejected": target,
        "traitor": state.traitor,
        "won": won,
        "second_chance_used": is_second_chance,
        "suspicion_matrix": state.suspicion_snapshot(),
        "clues": clues,
    }
