"""
Analyses each message for accusation/defense signals and contradiction.
Also manages per-agent emotional state updates (rule-based, no LLM).
"""

import json

import llm_settings
from openai import AsyncOpenAI

from game.game_state import AGENTS, GameState

CONTRADICTION_PENALTY = 0.12

_classifier: AsyncOpenAI | None = None


def _get_classifier() -> AsyncOpenAI:
    global _classifier
    if _classifier is None:
        _classifier = AsyncOpenAI()
    return _classifier


def _strip_code_fences(text: str) -> str:
    """Remove ``` / ```json fences if present."""
    raw = text.strip()
    if not raw.startswith("```"):
        return raw

    # Common model output: ```json\n{...}\n``` or ```\n{...}\n```
    parts = raw.split("```", 2)
    raw = parts[1] if len(parts) > 1 else raw
    raw = raw.strip()
    if raw.startswith("json"):
        raw = raw[4:]
    return raw.strip()


def _coerce_analysis_result(value: object) -> dict:
    """Normalize one analysis result object."""
    if not isinstance(value, dict):
        value = {}
    changes = value.get("changes", [])
    return {
        "changes": changes if isinstance(changes, list) else [],
        "has_contradiction": bool(value.get("has_contradiction", False)),
        "contradiction_detail": value.get("contradiction_detail", "")
        if isinstance(value.get("contradiction_detail", ""), str)
        else "",
    }


async def analyze_message(
    speaker: str,
    content: str,
    targets: list[str],
    prior_statements: list[str] | None = None,
) -> dict:
    """
    Returns {
      changes: [{from, target, delta}],
      has_contradiction: bool,
      contradiction_detail: str
    }
    """
    prior_ctx = ""
    if prior_statements:
        recent = prior_statements[-3:]
        prior_ctx = f"\n{speaker.capitalize()}'s prior statements:\n" + "\n".join(
            f'  - "{s}"' for s in recent
        )

    prompt = f"""You analyse social dynamics in a murder mystery game.
Speaker: {speaker}
Message: "{content}"
Other crew members: {", ".join(targets)}{prior_ctx}

Return a JSON object with:
1. "changes": array of suspicion adjustments. Each: {{"from": "<speaker>", "target": "<name>", "delta": <float -0.2 to 0.2>}}
   Include only entries with a clear signal (accusation, defence, alibi claim, deflection).
   If none, use [].
2. "has_contradiction": true or false — does this message contradict something the speaker said earlier?
3. "contradiction_detail": if has_contradiction is true, one sentence describing what contradicts what. Otherwise "".

Return ONLY the JSON object, no extra text."""

    try:
        client = _get_classifier()
        response = await client.chat.completions.create(
            model=llm_settings.SUSPICION_MODEL,
            temperature=0,
            timeout=30,
            messages=[
                {
                    "role": "system",
                    "content": "You are a game state analyser. Return only valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        raw = _strip_code_fences(response.choices[0].message.content)
        result = json.loads(raw)
        return _coerce_analysis_result(result)
    except Exception:
        return {"changes": [], "has_contradiction": False, "contradiction_detail": ""}


async def analyze_messages_batch(items: list[dict]) -> list[dict]:
    """Batch version of analyze_message.

    Input items format:
      [{speaker: str, content: str, targets: list[str], prior_statements?: list[str]}]

    Returns one result per item in the same order:
      [{changes: [...], has_contradiction: bool, contradiction_detail: str}]
    """
    if not items:
        return []

    prompt = f"""You analyse social dynamics in a murder mystery game.

For each item below, return an analysis result.

INPUT (JSON array):
{json.dumps(items)}

Return a JSON array with the same length and order.
Each element must be an object with:
1. \"changes\": array of suspicion adjustments. Each: {{\"from\": \"<speaker>\", \"target\": \"<name>\", \"delta\": <float -0.2 to 0.2>}}
   Include only entries with a clear signal (accusation, defence, alibi claim, deflection).
   If none, use [].
2. \"has_contradiction\": true or false — does this message contradict something the speaker said earlier?
3. \"contradiction_detail\": if has_contradiction is true, one sentence describing what contradicts what. Otherwise \"\".

Return ONLY the JSON array, no extra text."""

    try:
        client = _get_classifier()
        response = await client.chat.completions.create(
            model=llm_settings.SUSPICION_MODEL,
            temperature=0,
            timeout=30,
            messages=[
                {
                    "role": "system",
                    "content": "You are a game state analyser. Return only valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        raw = _strip_code_fences(response.choices[0].message.content)
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            raise ValueError("Batch classifier returned non-list")

        return [
            _coerce_analysis_result(parsed[i] if i < len(parsed) else {})
            for i in range(len(items))
        ]
    except Exception:
        return [
            {"changes": [], "has_contradiction": False, "contradiction_detail": ""}
            for _ in items
        ]


def update_emotional_states(state: GameState):
    """Rule-based per-agent emotional state update. No LLM needed."""
    for agent in AGENTS:
        others = [a for a in AGENTS if a != agent]
        avg_suspicion_toward_me = sum(
            state.suspicion[o].get(agent, 0.0) for o in others
        ) / len(others)
        is_traitor = state.traitor == agent

        if avg_suspicion_toward_me > 0.65:
            new_state = "desperate" if is_traitor else "terrified"
        elif avg_suspicion_toward_me > 0.45:
            new_state = "deflecting" if is_traitor else "defensive"
        elif state.tension >= 5:
            defaults = {"daisy": "panicking", "nova": "furious", "flint": "volatile"}
            new_state = defaults.get(agent, "anxious")
        elif state.tension >= 3:
            defaults = {"daisy": "nervous", "nova": "skeptical", "flint": "tense"}
            new_state = defaults.get(agent, "tense")
        else:
            defaults = {"daisy": "anxious", "nova": "analytical", "flint": "confident"}
            new_state = defaults.get(agent, "calm")

        state.emotional_state[agent] = new_state


async def process_message(state: GameState, speaker: str, content: str) -> dict:
    """
    Apply suspicion + emotional updates from a new message.
    Returns the analysis result so the orchestrator can act on contradictions.
    """
    all_names = ["daisy", "nova", "flint", "player"]
    targets = [n for n in all_names if n != speaker]
    prior = state.stated_facts.get(speaker, []) if speaker in AGENTS else []

    result = await analyze_message(speaker, content, targets, prior)

    for change in result["changes"]:
        frm = change.get("from", speaker)
        target = change.get("target", "")
        delta = float(change.get("delta", 0))
        if frm and target and delta != 0:
            state.update_suspicion(frm, target, delta)

    # Contradictions raise suspicion of the speaker significantly
    if result["has_contradiction"] and speaker in AGENTS:
        for other in [a for a in AGENTS if a != speaker]:
            state.update_suspicion(other, speaker, CONTRADICTION_PENALTY)

    update_emotional_states(state)
    return result


async def process_messages_batch(
    state: GameState, messages: list[tuple[str, str]]
) -> list[dict]:
    """Apply suspicion + emotional updates for multiple messages in one classifier call."""
    if not messages:
        return []

    all_names = ["daisy", "nova", "flint", "player"]

    # Snapshot prior statements before this batch. We'll advance this as we build the
    # prompt items so each message gets the correct prior context.
    prior_map: dict[str, list[str]] = {
        a: list(state.stated_facts.get(a, [])) for a in AGENTS
    }

    # Orchestrator has already appended these messages to stated_facts via state.add_message().
    # Trim them back out so each item gets true "prior" context.
    batch_counts: dict[str, int] = {a: 0 for a in AGENTS}
    for spk, _ in messages:
        if spk in batch_counts:
            batch_counts[spk] += 1
    for spk, count in batch_counts.items():
        if count:
            prior = prior_map.get(spk, [])
            prior_map[spk] = prior[:-count] if count <= len(prior) else []

    items: list[dict] = []
    for spk, content in messages:
        targets = [n for n in all_names if n != spk]
        prior = prior_map.get(spk, []) if spk in AGENTS else []
        items.append(
            {
                "speaker": spk,
                "content": content,
                "targets": targets,
                "prior_statements": prior[-3:],
            }
        )

        # Advance local prior state so subsequent items see earlier items as "prior".
        if spk in AGENTS:
            updated = prior + [content]
            prior_map[spk] = updated[-10:]

    results = await analyze_messages_batch(items)

    for (spk, _), result in zip(messages, results):
        for change in result.get("changes", []):
            if not isinstance(change, dict):
                continue
            frm = change.get("from", spk)
            target = change.get("target", "")
            try:
                delta = float(change.get("delta", 0))
            except Exception:
                delta = 0.0
            if frm and target and delta != 0:
                state.update_suspicion(frm, target, delta)

        # Contradictions raise suspicion of the speaker significantly
        if result.get("has_contradiction") and spk in AGENTS:
            for other in [a for a in AGENTS if a != spk]:
                state.update_suspicion(other, spk, CONTRADICTION_PENALTY)

    update_emotional_states(state)
    return results
