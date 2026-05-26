# AIRLOCK: Emergency Meeting

A social deduction game powered by LLMs. You are the Captain of a space station, and a traitor among the crew has ejected Sarah into the cold void of outer space.
You have 5 questions to interrogate your three crewmates and identify who the traitor is. Eject the wrong person and the traitor goes free.

The crew members respond in real-time with distinct personalities, accuse each other, and adapt their behavior based on their suspicions. One of them is lying.

## Gameplay

- **5 questions** to interrogate the crew before you must make a decision.
- Three AI crew members respond your questions, building on each other's answers.
- A hidden **suspicion matrix** tracks who suspects whom.
- **Eject** the crew member you think is the traitor to win; pick wrong and they escape.
- Voice input (push-to-talk) and voice output (TTS) supported.

### The Crew

| Agent    | Role      | Personality                            |
| -------- | --------- | -------------------------------------- |
| 🌱 Daisy | Botanist  | Empathetic, anxious, conflict-avoidant |
| ⚡ Flint | Engineer  | Blunt, defensive, suspicious of others |
| 🌐 Nova  | Navigator | Calm, analytical, quietly watchful     |

## Tech Stack

- **Backend:** Python / FastAPI / OpenAI SDK / WebSockets — `backend/`
- **Frontend:** React / TypeScript / TailwindCSS / Bun — `frontend/`
- **LLMs:** OpenAI (GPT-4.1-mini for agents, Whisper for STT, TTS-1 for voice)

## Setup

### Prerequisites

- [just](https://github.com/casey/just) (`brew install just`)
- [uv](https://github.com/astral-sh/uv)
- [bun](https://bun.sh)
- OpenAI API key

### Quick start

```bash
cp .env.example .env
# Add your OPENAI_API_KEY to .env

just setup   # install deps (run once after cloning)
just dev     # start backend + frontend
```

Open http://localhost:5173.

## Configuration

```env
OPENAI_API_KEY=sk-...

# Optional: override models (defaults shown)
AIRLOCK_AGENT_MODEL=gpt-4.1-mini
AIRLOCK_SUSPICION_MODEL=gpt-4.1-mini
AIRLOCK_CLUE_REVEAL_MODEL=gpt-4.1-mini
AIRLOCK_STT_MODEL=whisper-1
AIRLOCK_TTS_MODEL=tts-1
```

For cheaper development runs:

```bash
AIRLOCK_AGENT_MODEL=gpt-4.1-nano AIRLOCK_SUSPICION_MODEL=gpt-4.1-nano just dev
```

## Available Commands

```bash
just dev       # run backend + frontend concurrently
just setup     # copy .env and install all deps (first-time)
just install   # install deps only
just format    # lint + format (ruff + prettier)
just backend   # backend only
just frontend  # frontend only
```
