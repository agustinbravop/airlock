# AIRLOCK — Implementation Notes

## Architecture Overview

```
/airlock
  /backend          Python 3.11+ / FastAPI
  /frontend         React 18 / TypeScript / Tailwind / Vite
  .env              OPENAI_API_KEY
```

---

## Models Used

| Purpose                              | Model                                                | Temp | Called from                                                 |
| ------------------------------------ | ---------------------------------------------------- | ---- | ----------------------------------------------------------- |
| Agent responses (Daisy, Nova, Flint) | `AIRLOCK_AGENT_MODEL` (default `gpt-4.1-mini`)       | 0.85 | `agents/base_agent.py` — `respond()` and `stream()`         |
| Suspicion / contradiction analysis   | `AIRLOCK_SUSPICION_MODEL` (default `gpt-4.1-mini`)   | 0.0  | `game/suspicion_engine.py` — `analyze_message()`            |
| Alibi generation (game start)        | (predefined, no LLM)                                 | —    | `game/alibi_generator.py` — `generate_alibis()`             |
| Post-game clue reveal (1 clue)       | `AIRLOCK_CLUE_REVEAL_MODEL` (default `gpt-4.1-mini`) | 0.0  | `game/orchestrator/reveal.py` — `generate_clue_reveal()`    |
| Traitor final reveal (traitor-wins)  | `AIRLOCK_CLUE_REVEAL_MODEL` (default `gpt-4.1-mini`) | 0.9  | `game/orchestrator/reveal.py` — `generate_traitor_reveal()` |
| Speech-to-text (player voice)        | `AIRLOCK_STT_MODEL` (default `whisper-1`)            | —    | `routes/voice.py` — `POST /voice/transcribe`                |
| Text-to-speech (agent voices)        | `AIRLOCK_TTS_MODEL` (default `tts-1`)                | —    | `server.py` — `_send_stream_end()`                          |

### Cheaper Development Defaults

You can override models without editing code, for example:

```bash
AIRLOCK_AGENT_MODEL=gpt-4.1-nano
AIRLOCK_SUSPICION_MODEL=gpt-4.1-nano
AIRLOCK_CLUE_REVEAL_MODEL=gpt-4.1-nano
```

### TTS Voice Assignment

| Agent | Voice  |
| ----- | ------ |
| Daisy | `nova` |
| Nova  | `onyx` |
| Flint | `echo` |

### Temperature Rationale

- **0.85** for agent responses — enough randomness to feel spontaneous and avoid repetitive phrasing, low enough to stay coherent and in-character.
- **0.0** for analysis calls (suspicion, clue reveal) — deterministic extraction tasks where consistency matters more than creativity.
- **0.9** for alibi generation — higher variance produces more varied, interesting alibis across games.

---

## Backend

**Entry point:** `backend/server.py`
Runs on port 8000 via uvicorn.

### WebSocket Protocol

All real-time communication goes through `ws://localhost:8000/ws`.

**Client → Server:**
| type | fields | description |
|------|--------|-------------|
| `player_message` | `content: string` | Player sends a chat line |
| `eject` | `target: "daisy"\|"nova"\|"flint"` | Trigger ejection vote |
| `reset` | — | Start a new game |

**Server → Client:**
| type | fields | description |
|------|--------|-------------|
| `connected` | `agents: string[]` | Handshake on connect |
| `player_message` | `content` | Echoed to all connections |
| `agent_stream_start` / `agent_stream_token` / `agent_stream_end` | `agent`, `token?`, `audio?` | Word-by-word streaming (optional TTS starts at stream start) |
| `typing_start` | `agent` | Show typing indicator |
| `typing_stop` | `agent` | Hide typing indicator |
| `game_over` | `ejected`, `traitor`, `won`, `suspicion_matrix` | End game reveal |
| `reset` | — | Client should clear state |

### Agent System (`/backend/agents/`)

Each agent (`daisy.py`, `nova.py`, `flint.py`) extends `BaseAgent`.

`BaseAgent.respond(state)`:

1. Builds a dynamic system prompt including personality, current suspicion values, tension level, and hidden role (TRAITOR or INNOCENT)
2. Passes the last 18 messages of shared chat history formatted as `[NAME]: message`
3. Calls `gpt-4.1-mini` with temperature 0.85

Traitor is randomly assigned at game start (`GameState.__init__`) and never changes mid-game.

### Orchestrator (`/backend/game/orchestrator/`)

Called after each player message:

1. Schedules a short **sequence** of agent messages (2–5; CRISIS is exactly 3, one per agent)
2. Staggers responses with random delays
3. Streams word-by-word at a fixed cadence (`_STREAM_WPM`)
4. Injects lightweight `__meta__` guidance so agents reply to each other during the sequence
5. Broadcasts `system_message: "Crew waiting for Captain."` once at the end of the sequence

### Tension / Pacing

- `GameState.tension` is an integer 0–5.
- It increments by 1 at the end of each captain-driven sequence.
- At 5, the captain cannot ask more questions and must eject.

### Suspicion Engine (`/backend/game/suspicion_engine.py`)

After each message (player or agent):

- Calls `gpt-4.1-mini` (temperature 0) to extract accusation/defense signals
- Returns `[{from, target, delta}]` list
- Applies deltas to `GameState.suspicion` matrix
- Bumps `tension` if accusatory keywords detected

Suspicion values are injected into each agent's system prompt, giving them awareness of who suspects whom.

### Voice Routes (`/backend/routes/voice.py`)

- `POST /voice/transcribe` — accepts `multipart/form-data` with `audio` file, returns `{text}`
- `POST /voice/tts` — accepts `{text, agent}`, returns `{audio: base64, format: "mp3"}`

TTS voices per agent:

- Daisy → `nova`
- Nova → `onyx`
- Flint → `echo`

---

## Frontend

**Entry point:** `frontend/src/main.tsx`
Runs on port 5173 via Vite dev server.

### Components

| Component         | Purpose                                                         |
| ----------------- | --------------------------------------------------------------- |
| `Intro.tsx`       | Animated reveal of incident text + "Enter" button               |
| `Chat.tsx`        | Main game UI — messages, typing indicators, input, eject button |
| `Message.tsx`     | Single message bubble with avatar                               |
| `VoiceButton.tsx` | Push-to-talk mic button (hold = record, release = transcribe)   |
| `EjectModal.tsx`  | `EjectSelect` (pick a crew member) + `GameOver` (reveal screen) |

### Hooks

- `useWebSocket(onMessage)` — manages WS connection, returns `{ send, connected }`
- `useAudioRecorder(onTranscription)` — MediaRecorder + Whisper transcription flow

### Voice Flow

1. Player holds mic button → `startRecording()` starts `MediaRecorder`
2. Player releases → `stopRecording()` fires `mr.onstop`
3. Audio blob is POSTed to `/voice/transcribe`
4. Transcription text is set in the input field
5. Player reviews and hits Enter or Send

TTS audio arrives as the `audio` field on `agent_stream_start` (base64 mp3), immediately autoplayed.

---

## Setup

### With `just` (recommended)

```bash
brew install just   # one-time

# First time: copies .env and installs all deps
just setup

# Every time after that
just dev
```

### Formatting / Lint

```bash
just format
```

Individual recipes: `just backend`, `just frontend`, `just install`.

### Manually

```bash
# Backend
cd backend
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
cp ../.env .env
python server.py

# Frontend (separate terminal)
cd frontend
bun install
bun run dev
```

Open http://localhost:5173.

---

## Design Decisions

**Why one WebSocket for everything?**
The orchestrator needs to push agent messages, typing events, and game-over payloads at arbitrary times. A single persistent WS is simpler than polling and avoids the ordering issues SSE would create with concurrent agent responses.

**Why not LangChain memory objects?**
Group chat doesn't map cleanly to per-agent conversation memory. Instead, the shared `chat_history` list is formatted into each agent's prompt directly. This gives each agent full context of the group discussion while keeping per-agent state (suspicion levels, emotional tension) separate and injectable.

**Why inject suspicion into prompts rather than a tool call?**
Keeps the architecture simple. Each agent call is a single LLM inference — no function-calling round trips. Suspicion is just context the agent can act on or ignore, which feels more natural and less gamified.

**Tension**
`GameState.tension` is an integer 0–5. It increments by 1 at the end of each captain-driven sequence; at 5 the captain cannot ask more questions and must eject.

---

## Game Pacing

The game is paced by a fixed number of captain questions:

- The captain gets 5 questions (tension 0–4).
- After each sequence ends, tension increments by 1.
- At tension 5, no more questions: the captain must eject.

## Known Limitations / Future Work

- Single game session (no auth, no persistence); `reset` message restarts the singleton
- TTS is generated after each response — adds ~1s of latency; could be cached
- Suspicion classifier was previously a separate LLM call per message; now batched per captain sequence (player + sequence). Could still be replaced with regex heuristics for speed
- Voice push-to-talk uses `mousedown`/`mouseup`; mobile needs `touchstart`/`touchend` (partially handled)
