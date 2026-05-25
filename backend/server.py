import asyncio
import base64
import json

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI

load_dotenv()

# Load .env before importing modules that read env vars at import time.
import llm_settings  # noqa: E402
from game.alibi_generator import generate_alibis  # noqa: E402
from game.game_state import AGENTS, MAX_TENSION, GameState  # noqa: E402
from game.orchestrator import AgentCallbacks, handle_eject, handle_player_message  # noqa: E402
from routes.voice import router as voice_router  # noqa: E402

AGENT_VOICES = {
    "daisy": "nova",
    "nova": "onyx",
    "flint": "echo",
}

IDLE_TIMEOUT = (
    30 * 60
)  # seconds; close abandoned connections after 30 min of inactivity

_openai_client = AsyncOpenAI()

app = FastAPI(title="AIRLOCK")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(voice_router)


async def _init_game(state: GameState):
    """Generate alibis and inject them into game state."""
    try:
        alibis = await generate_alibis(state.traitor)
        state.alibis = alibis
        print(f"Alibis generated. Traitor: {state.traitor}")
    except Exception as e:
        print(f"Alibi init failed: {e}")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    state = GameState()
    await _init_game(state)
    tts_enabled = False

    async def send(payload: dict):
        await websocket.send_text(json.dumps(payload))

    async def send_typing(agent: str):
        await send({"type": "typing_start", "agent": agent})

    async def send_stream_start(agent: str):
        await send({"type": "typing_stop", "agent": agent})
        await send({"type": "agent_stream_start", "agent": agent})

    async def send_stream_token(agent: str, token: str):
        await send({"type": "agent_stream_token", "agent": agent, "token": token})

    async def send_stream_end(agent: str, full_text: str):
        audio_b64 = None
        if tts_enabled:
            try:
                voice = AGENT_VOICES.get(agent, "alloy")
                tts_response = await _openai_client.audio.speech.create(
                    model=llm_settings.TTS_MODEL,
                    voice=voice,
                    input=full_text,
                    response_format="mp3",
                )
                audio_b64 = base64.b64encode(tts_response.content).decode("utf-8")
            except Exception as e:
                print(f"TTS error for {agent}: {e}")
        await send({"type": "agent_stream_end", "agent": agent, "audio": audio_b64})

    callbacks = AgentCallbacks(
        send_typing=send_typing,
        send_stream_start=send_stream_start,
        send_stream_token=send_stream_token,
        send_stream_end=send_stream_end,
        broadcast=send,
    )

    await send(
        {
            "type": "connected",
            "agents": AGENTS,
            "tension": state.tension,
            "tension_max": MAX_TENSION,
            "eject_unlocked": state.tension >= 1,
            "suspicion_matrix": state.suspicion_snapshot(),
            "emotional_state": dict(state.emotional_state),
            "tts_enabled": tts_enabled,
        }
    )

    try:
        while True:
            try:
                raw = await asyncio.wait_for(
                    websocket.receive_text(), timeout=IDLE_TIMEOUT
                )
            except asyncio.TimeoutError:
                await websocket.close()
                break

            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "player_message":
                content = msg.get("content", "").strip()
                if not content or state.game_over:
                    continue
                await send({"type": "player_message", "content": content})
                asyncio.create_task(handle_player_message(content, state, callbacks))

            elif msg_type == "eject":
                target = msg.get("target", "")
                if target not in AGENTS or state.game_over:
                    continue
                if state.tension < 1:
                    await send(
                        {
                            "type": "eject_denied",
                            "reason": f"Gather more information first. ({state.tension}/2 sequences)",
                        }
                    )
                    continue
                result = await handle_eject(target, state, callbacks)
                await send(result)

            elif msg_type == "set_tts":
                tts_enabled = bool(msg.get("enabled", False))
                await send({"type": "tts_state", "enabled": tts_enabled})

            elif msg_type == "reset":
                state = GameState()
                await _init_game(state)
                await send({"type": "reset"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
