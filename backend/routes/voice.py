import base64
import io

import llm_settings
from fastapi import APIRouter, File, HTTPException, UploadFile
from openai import AsyncOpenAI
from pydantic import BaseModel

router = APIRouter(prefix="/voice", tags=["voice"])
client = AsyncOpenAI()

AGENT_VOICES = {
    "daisy": "nova",
    "nova": "onyx",
    "flint": "echo",
}


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """Convert uploaded audio to text using Whisper."""
    try:
        audio_bytes = await audio.read()
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = audio.filename or "recording.webm"

        transcript = await client.audio.transcriptions.create(
            model=llm_settings.STT_MODEL,
            file=audio_file,
        )
        return {"text": transcript.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TTSRequest(BaseModel):
    text: str
    agent: str


@router.post("/tts")
async def text_to_speech(req: TTSRequest):
    """Convert agent text to speech, returning base64 audio."""
    voice = AGENT_VOICES.get(req.agent, "alloy")
    try:
        response = await client.audio.speech.create(
            model=llm_settings.TTS_MODEL,
            voice=voice,
            input=req.text,
            response_format="mp3",
        )
        audio_bytes = response.content
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return {"audio": audio_b64, "format": "mp3"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
