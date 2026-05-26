import { useCallback, useRef, useState } from "react";

// ── Audio queue: play clips sequentially, never overlapping ──────────────────

const _queue: string[] = [];
let _playing = false;
let _currentAudio: HTMLAudioElement | null = null;

function _playNext() {
  if (_playing || _queue.length === 0) return;
  const b64 = _queue.shift()!;
  _playing = true;
  const audio = new Audio(`data:audio/mp3;base64,${b64}`);
  _currentAudio = audio;
  audio.onended = () => {
    _currentAudio = null;
    _playing = false;
    _playNext();
  };
  audio.onerror = () => {
    _currentAudio = null;
    _playing = false;
    _playNext();
  };
  audio.play().catch(() => {
    _currentAudio = null;
    _playing = false;
    _playNext();
  });
}

export function enqueueAudio(b64: string) {
  _queue.push(b64);
  _playNext();
}

export function stopAudio() {
  _currentAudio?.pause();
  _currentAudio = null;
  _queue.length = 0;
  _playing = false;
}

// ── Voice recorder ───────────────────────────────────────────────────────────

export function useAudioRecorder(onTranscription: (text: string) => void) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");
          const res = await fetch("/voice/transcribe", { method: "POST", body: formData });
          const data = await res.json();
          if (data.text?.trim()) onTranscription(data.text.trim());
        } catch (err) {
          console.error("Transcription failed:", err);
        } finally {
          setTranscribing(false);
        }
      };

      mr.start();
      setRecording(true);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  }, [onTranscription]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  return { recording, transcribing, startRecording, stopRecording };
}
