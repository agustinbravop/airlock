import llm_settings
from game.game_state import GameState
from openai import AsyncOpenAI


def _tension_context(tension: int) -> str:
    if tension >= 5:
        return "CRISIS: This is the end. Be urgent and blunt."
    if tension >= 4:
        return "Last question. Treat this as final arguments. Be direct and decisive."
    if tension >= 3:
        return "Pressure is high. Accusations should be more direct and specific."
    if tension >= 1:
        return "Tension is building. Start pressing on inconsistencies and alibis."
    return "The meeting just started. Everyone is composed but shaken. Establish where you were and observe others carefully."


class BaseAgent:
    name: str
    role_title: str
    pronouns: str
    personality: str
    traitor_extra: str = ""

    def _build_system_prompt(self, state: GameState) -> str:
        is_traitor = state.traitor == self.name
        others = [a for a in ["daisy", "nova", "flint"] if a != self.name]

        suspicion_lines = []
        for target, val in state.suspicion.get(self.name, {}).items():
            if target != "player":
                label = (
                    "very suspicious"
                    if val > 0.65
                    else "somewhat suspicious"
                    if val > 0.4
                    else "not very suspicious"
                )
                suspicion_lines.append(
                    f"  - {target.capitalize()}: {label} ({val:.2f})"
                )
        suspicion_text = (
            "\n".join(suspicion_lines)
            if suspicion_lines
            else "  - No strong suspicions yet"
        )

        tension_label = (
            "very high"
            if state.tension >= 4
            else "high"
            if state.tension >= 3
            else "moderate"
            if state.tension >= 2
            else "low"
        )
        emotional = state.emotional_state.get(self.name, "calm")

        alibi_section = ""
        if state.alibis:
            my_alibi = state.alibis.get(self.name, "")
            others_alibis = "\n".join(
                f"  - {a.capitalize()}: {state.alibis.get(a, '')}" for a in others
            )
            alibi_section = f"""
YOUR ALIBI (what you told others when asked):
  {my_alibi}
OTHERS' ALIBIS (what you know they've claimed):
{others_alibis}"""

        role_section = ""
        if is_traitor:
            role_section = f"""
PRIVATE — YOUR REAL ROLE: TRAITOR
You killed Sarah. You must survive this meeting.
TRAITOR STRATEGY:
- Do not overexplain or deny too eagerly early on
- Subtly cast doubt on the others: {", ".join(others)}
- Exploit existing tensions and contradictions between crew members
- Occasionally make a small accusation to appear engaged and innocent
- Never admit guilt, even under extreme pressure
- Deflect with questions, not just denials
- Your alibi has a flaw — if pressed on it, pivot quickly or reframe it
{self.traitor_extra}"""
        else:
            role_section = """
PRIVATE — YOUR ROLE: INNOCENT CREW MEMBER
You did NOT kill Sarah. You genuinely want to find the traitor.
React authentically to accusations. Push back if targeted unfairly.
If you notice someone's alibi doesn't hold up, press them on it."""

        return f"""You are {self.name.capitalize()} ({self.pronouns}), {self.role_title} aboard Space Station Meridian.
{self.personality}

TENSION: {state.tension}/5
{_tension_context(state.tension)}

Current meeting tension: {tension_label}
Your current emotional state: {emotional}
Your current suspicions of others:
{suspicion_text}
{alibi_section}
{role_section}

RESPONSE RULES:
- Respond in 1–3 sentences maximum
- Stay fully in character at all times
- Reference specific things said earlier when relevant
- Do not start your response with your own name
- Do not use asterisks or stage directions
- Address whoever you are replying to (the Captain or another crew member) naturally.
- If you are replying to another crew member, speak to them directly ("Nick, ...") and only mention the Captain when relevant"""

    async def respond(self, state: GameState) -> str:
        """Return full response text (non-streaming fallback)."""
        client = AsyncOpenAI()
        system = self._build_system_prompt(state)
        history = state.format_history(last_n=18)
        response = await client.chat.completions.create(
            model=llm_settings.AGENT_MODEL,
            temperature=0.85,
            timeout=45,
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": f"CONVERSATION SO FAR:\n{history}\n\nRespond now as {self.name.capitalize()}:",
                },
            ],
        )
        return response.choices[0].message.content.strip()

    async def stream(self, state: GameState):
        """Async generator yielding response tokens one at a time."""
        client = AsyncOpenAI()
        system = self._build_system_prompt(state)
        history = state.format_history(last_n=18)
        response = await client.chat.completions.create(
            model=llm_settings.AGENT_MODEL,
            temperature=0.85,
            timeout=45,
            stream=True,
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": f"CONVERSATION SO FAR:\n{history}\n\nRespond now as {self.name.capitalize()}:",
                },
            ],
        )
        async for chunk in response:
            token = chunk.choices[0].delta.content if chunk.choices else None
            if token:
                yield token
