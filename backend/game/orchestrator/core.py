import asyncio
import random
from typing import Callable

from game.game_state import AGENTS, MAX_TENSION, GameState
from game.suspicion_engine import (
    process_message,
    process_messages_batch,
    update_emotional_states,
)

from .reveal import generate_clue_reveal, generate_traitor_reveal
from .scheduling import build_schedule
from .streaming import AgentCallbacks, stream_agent


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

        schedule = build_schedule(state, content, analysis)

        contradiction_detail = (
            analysis.get("contradiction_detail", "")
            if analysis.get("has_contradiction")
            else ""
        )

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
            out = await stream_agent(
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
                    "content": "We're in crisis. Eject a suspect now.",
                }
            )
        else:
            # Explicitly hand control back to the captain after each non-crisis sequence.
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


async def handle_eject(
    target: str,
    state: GameState,
    cb: AgentCallbacks,
) -> dict:
    correct = target == state.traitor
    state.game_over = True
    state.ejected = target
    won = correct

    # Log the ejection in chat before any reactions
    await cb.broadcast(
        {
            "type": "system_message",
            "content": f"{target.capitalize()} was ejected. They were {'GUILTY' if won else 'INNOCENT'}.",
        }
    )

    survivors = [a for a in AGENTS if a != target]

    if won:
        for agent_name in survivors:
            await asyncio.sleep(random.uniform(0.4, 1.0))
            state.add_message(
                "__meta__",
                f"[The traitor {target.capitalize()} was correctly identified and ejected. "
                f"React briefly with relief or justice in character. One or two sentences.]",
            )
            await stream_agent(agent_name, state, cb)
    else:
        # Innocent survivors react with shock
        innocent_survivors = [a for a in survivors if a != state.traitor]
        for agent_name in innocent_survivors:
            await asyncio.sleep(random.uniform(0.4, 1.0))
            state.add_message(
                "__meta__",
                f"[{target.capitalize()} was ejected but they were INNOCENT. "
                f"React with horror and fear. One sentence only.]",
            )
            await stream_agent(agent_name, state, cb)

    clues = await generate_clue_reveal(state)
    traitor_message = None if won else await generate_traitor_reveal(state)

    return {
        "type": "game_over",
        "ejected": target,
        "traitor": state.traitor,
        "won": won,
        "clues": clues,
        "traitor_message": traitor_message,
    }
