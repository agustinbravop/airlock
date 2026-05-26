import json

import llm_settings
from openai import AsyncOpenAI

from game.game_state import GameState


async def generate_clue_reveal(state: GameState) -> list[dict]:
    """Post-game: find the single most damning clue pointing to the traitor."""
    history = state.format_history(last_n=60)
    traitor = state.traitor
    alibis = state.alibis or {}
    prompt = f"""You are reviewing a murder mystery deduction game that just ended.
The traitor was: {traitor.capitalize()}
Sarah was killed by the traitor.

Known alibis (one is flawed, belonging to the traitor):
{json.dumps(alibis, indent=2)}

Full conversation:
{history}

Identify the SINGLE most damning moment from this conversation that pointed to {traitor.capitalize()} as the killer.
Look for: an alibi inconsistency or a detail only the killer would know.

Return a JSON array with exactly ONE object:
[{{\"speaker\": \"...\", \"quote\": \"exact quote or close paraphrase\", \"clue\": \"one sentence explaining why this was suspicious\"}}]
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
            raw = raw.split("```", 1)[1]
            # Keep behavior identical to the previous single-file orchestrator:
            # take the fenced payload section (often `json\n...`).
            raw = raw.split("```", 1)[0]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        print(f"Clue reveal failed: {e}")
        return []


async def generate_traitor_reveal(state: GameState) -> str:
    """Generate the traitor's final in-character confession after winning."""
    traitor = state.traitor
    history = state.format_history(last_n=30)
    prompt = f"""You are {traitor.capitalize()}, the traitor in a spaceship crew murder mystery. You just won — an innocent crew member was ejected instead of you.

Write ONE final in-character message, 2–4 sentences, dropping all pretense and revealing your true intentions. Be chilling and specific to what happened in the game.

Game history for context:
{history}

Write only the message text, no quotes."""

    try:
        client = AsyncOpenAI()
        response = await client.chat.completions.create(
            model=llm_settings.CLUE_REVEAL_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.9,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Traitor reveal failed: {e}")
        return "You never had a chance. I've already made sure of that."
