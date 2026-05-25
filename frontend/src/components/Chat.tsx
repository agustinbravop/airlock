import { useEffect, useRef, useState, useCallback } from "react";
import {
  ChatMessage,
  AgentName,
  GameOverPayload,
  WrongEjectPayload,
  TypingState,
  ServerMessage,
} from "../types";
import Message from "./Message";
import VoiceButton from "./VoiceButton";
import { EjectSelect, WrongEjectOverlay, GameOver } from "./EjectModal";
import SuspicionPanel from "./SuspicionPanel";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAudioRecorder } from "../hooks/useAudio";
import { useTokenDrain } from "../hooks/useTokenDrain";
import daisyPfp from "../assets/daisy.png";
import novaPfp from "../assets/nova.png";
import flintPfp from "../assets/flint.png";

const AGENT_PFPS: Record<AgentName, string> = { daisy: daisyPfp, nova: novaPfp, flint: flintPfp };
const AGENT_BG: Record<AgentName, string> = {
  daisy: "bg-emerald-700",
  nova: "bg-blue-700",
  flint: "bg-purple-700",
};

const EJECT_MIN = 1;

const PROMPTS_BY_TENSION: Record<number, [string, ...string[]]> = {
  0: [
    "Give me your alibi again. Include a specific detail someone else could verify.",
    "Where were you in the 10 minutes before Sarah died? One sentence.",
  ],
  1: ["Could someone vouch for Flint?", "Who has the most to gain from Sarah being gone?"],
  2: [
    "Daisy: take a deep breath and think. What is your gut telling you?",
    "Nova: separate facts from guesses. What do we actually know?",
  ],
  3: [
    "Time's running out. Call out one inconsistency you heard.",
    "Flint, you seem to know something the rest of us don't.",
  ],
  4: [
    "Final chance: name your suspect and your single strongest reason.",
    "Last question. What single detail should I not ignore?",
  ],
};

let msgIdCounter = 0;
function nextId() {
  return String(++msgIdCounter);
}

function WaitingDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-5 text-left tracking-tight">{".".repeat(count)}</span>;
}

function SystemMessage({ content }: { content: string }) {
  const isWaiting = content === "Crew waiting for Captain.";
  return (
    <div className="text-center">
      <span
        className={
          isWaiting
            ? "text-gray-300 text-xs uppercase border border-space-border px-3 py-1"
            : "text-accent-red text-xs uppercase border border-accent-red/30 px-3 py-1 animate-pulse"
        }
      >
        {isWaiting ? (
          <>
            CREW WAITING FOR CAPTAIN
            <WaitingDots />
          </>
        ) : (
          `⚠ ${content}`
        )}
      </span>
    </div>
  );
}

function TypingRow({ agent }: { agent?: AgentName }) {
  return (
    <div className="flex gap-3 items-center">
      {agent ? (
        <div
          className={`w-[108px] h-[108px] ${AGENT_BG[agent]} border border-space-border shrink-0 overflow-hidden`}
          style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)" }}
        >
          <img
            src={AGENT_PFPS[agent]}
            alt={agent}
            className="w-full h-full object-cover"
            style={{ imageRendering: "pixelated" }}
            draggable={false}
          />
        </div>
      ) : (
        <div className="w-[108px] h-[108px] bg-gray-800 border border-space-border shrink-0 animate-pulse" />
      )}
      <div className="bg-space-panel border border-space-border px-4 py-2.5 flex gap-1 items-center">
        <span
          className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const drain = useTokenDrain({
    onCommit: useCallback(({ agent, text }: { agent: AgentName; text: string }) => {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), speaker: agent, content: text, timestamp: Date.now() },
      ]);
    }, []),
    onSystemMessages: useCallback((contents: string[]) => {
      setMessages((prev) => [
        ...prev,
        ...contents.map((content) => ({
          id: nextId(),
          speaker: "system" as AgentName,
          content,
          timestamp: Date.now(),
        })),
      ]);
    }, []),
  });

  const [input, setInput] = useState("");
  const [typing, setTyping] = useState<TypingState>({
    daisy: false,
    nova: false,
    flint: false,
  });
  const [showEject, setShowEject] = useState(false);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [wrongEject, setWrongEject] = useState<WrongEjectPayload | null>(null);
  const [tension, setTension] = useState(0);
  const [tensionMax, setTensionMax] = useState(5);
  const [ejectDeniedMsg, setEjectDeniedMsg] = useState<string | null>(null);
  const [suspicionMatrix, setSuspicionMatrix] = useState<Record<string, Record<string, number>>>(
    {},
  );
  const [emotionalState, setEmotionalState] = useState<Record<string, string>>({});
  const [showSuspicion, setShowSuspicion] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [promptSeed, setPromptSeed] = useState(0);
  const [awaitingCrew, setAwaitingCrew] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFocusedOnConnect = useRef(false);
  const ejectUnlocked = tension >= EJECT_MIN;

  function focusInputToEnd() {
    // Ensure focus + caret placement after React updates the controlled value.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      requestAnimationFrame(() => {
        const end = el.value.length;
        try {
          el.setSelectionRange(end, end);
        } catch {
          // Some input types don't support selection range; ours does.
        }
      });
    });
  }

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "connected":
        setTension(msg.tension);
        setTensionMax(msg.tension_max);
        setSuspicionMatrix(msg.suspicion_matrix);
        setEmotionalState(msg.emotional_state);
        setTtsEnabled(msg.tts_enabled);
        break;

      case "tts_state":
        setTtsEnabled(msg.enabled);
        break;

      case "player_message":
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            speaker: "player",
            content: msg.content,
            timestamp: Date.now(),
          },
        ]);
        break;

      case "typing_start":
        setAwaitingCrew(false);
        // Suppress indicator if another agent is draining — the pending agent
        // will appear as streaming directly when it's its turn.
        if (!drain.isActive() && !drain.hasPending()) {
          setTyping((t) => ({ ...t, [msg.agent]: true }));
        }
        break;

      case "typing_stop":
        setTyping((t) => ({ ...t, [msg.agent]: false }));
        break;

      case "agent_stream_start":
        setAwaitingCrew(false);
        setTyping((t) => ({ ...t, [msg.agent]: false }));
        drain.startAgent(msg.agent);
        break;

      case "agent_stream_token":
        drain.pushToken(msg.agent, msg.token);
        break;

      case "agent_stream_end":
        drain.endAgent(msg.agent, msg.audio);
        break;

      case "tension_update":
        setTension(msg.tension);
        setTensionMax(msg.tension_max);
        break;

      case "system_message":
        if (msg.content === "Crew waiting for Captain.") setPromptSeed((n) => n + 1);
        if (!drain.holdSystemMessage(msg.content)) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              speaker: "system" as AgentName,
              content: msg.content,
              timestamp: Date.now(),
            },
          ]);
        }
        break;

      case "eject_denied":
        setEjectDeniedMsg(msg.reason);
        setTimeout(() => setEjectDeniedMsg(null), 3000);
        break;

      case "suspicion_update":
        setSuspicionMatrix(msg.matrix);
        setEmotionalState(msg.emotional_state);
        break;

      case "wrong_eject":
        setWrongEject({
          ejected: msg.ejected,
          traitor: msg.traitor,
          suspicion_matrix: msg.suspicion_matrix,
        });
        setSuspicionMatrix(msg.suspicion_matrix);
        break;

      case "game_over":
        drain.stopDraining();
        setTyping({ daisy: false, nova: false, flint: false });
        setWrongEject(null);
        setAwaitingCrew(false);
        setGameOver(msg);
        break;

      case "reset":
        drain.stopDraining();
        setMessages([]);
        setTyping({ daisy: false, nova: false, flint: false });
        setGameOver(null);
        setWrongEject(null);
        setTension(0);
        setTensionMax(5);
        setSuspicionMatrix({});
        setEmotionalState({});
        setPromptSeed(0);
        setAwaitingCrew(false);
        break;
    }
  }, []);

  const { send, connected } = useWebSocket(handleServerMessage);
  const [activeLine, setActiveLine] = useState<0 | 1 | 2>(2);
  const { recording, transcribing, startRecording, stopRecording } = useAudioRecorder((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput((prev) => {
      const needsSpace = prev.length > 0 && !/\s$/.test(prev);
      return prev + (needsSpace ? " " : "") + trimmed;
    });
    setActiveLine(2);
    focusInputToEnd();
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, drain.streamingText, typing]);

  useEffect(() => {
    document.body.classList.add("chat-locked");
    return () => document.body.classList.remove("chat-locked");
  }, []);

  useEffect(() => {
    if (connected && !hasFocusedOnConnect.current) {
      hasFocusedOnConnect.current = true;
      inputRef.current?.focus();
    }
  }, [connected]);

  const crisis = tension >= tensionMax;
  const crewBusy =
    Object.values(typing).some(Boolean) || Object.keys(drain.streamingRef.current).length > 0;

  function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || gameOver || crewBusy || crisis) return;
    send({ type: "player_message", content: trimmed });
    setInput("");
    setAwaitingCrew(true);
    setMessages((prev) => prev.filter((m) => m.content !== "Crew waiting for Captain."));
  }
  const promptList = PROMPTS_BY_TENSION[tension] ?? PROMPTS_BY_TENSION[0];
  const promptStart = promptSeed % promptList.length;
  const suggestedPrompts: [string, string] = [
    promptList[promptStart],
    promptList[(promptStart + 1) % promptList.length],
  ];

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveLine((n) => Math.max(0, n - 1) as 0 | 1 | 2);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveLine((n) => Math.min(2, n + 1) as 0 | 1 | 2);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (activeLine === 0 || activeLine === 1) {
        const s = suggestedPrompts[activeLine];
        if (s) {
          setInput(s);
          setActiveLine(2);
          focusInputToEnd();
        }
        return;
      }
      sendMessage(input);
    }
  }

  function handleEjectClick() {
    if (!ejectUnlocked) {
      setEjectDeniedMsg("Gather more information first.");
      setTimeout(() => setEjectDeniedMsg(null), 3000);
      return;
    }
    setShowEject(true);
  }

  function handleEject(target: AgentName) {
    setShowEject(false);
    send({ type: "eject", target });
  }

  function handleReset() {
    send({ type: "reset" });
    setGameOver(null);
    setMessages([]);
  }

  const typingAgents = (Object.keys(typing) as AgentName[]).filter((a) => typing[a]);
  const streamingAgents = Object.keys(drain.streamingText) as AgentName[];
  const canAsk = connected && !gameOver && !crewBusy && !crisis;

  const commsStatus = !connected
    ? "RECONNECTING"
    : gameOver
      ? "SESSION ENDED"
      : crisis
        ? "CRISIS: EJECT REQUIRED"
        : crewBusy
          ? "CREW RESPONDING"
          : "CHANNEL OPEN";
  const statusTone = !connected
    ? "text-gray-400"
    : crisis
      ? "text-accent-red"
      : crewBusy
        ? "text-accent-amber"
        : "text-accent-cyan";

  const questionsLeft = Math.max(0, tensionMax - tension);

  return (
    <div className="h-dvh bg-space-black flex flex-col font-mono">
      {/* Header */}
      <div className="border-b border-space-border bg-space-dark px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase shrink-0 hidden sm:inline">Crew:</span>
          <div className="flex items-center gap-4">
            {(["daisy", "nova", "flint"] as AgentName[]).map((agent) => (
              <div key={agent} className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    typing[agent] || drain.streamingText[agent] !== undefined
                      ? "bg-accent-amber animate-pulse"
                      : "bg-emerald-500"
                  }`}
                />
                <span className="text-xs text-gray-200 uppercase">{agent}</span>
                {emotionalState[agent] && (
                  <span className="text-xs text-gray-300 capitalize hidden sm:inline">
                    [{emotionalState[agent]}]
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Tension indicator */}
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold uppercase ${crisis ? "text-accent-red" : "text-gray-300"}`}
            >
              TENSION:
            </span>
            <div className="w-16 h-1 bg-space-border rounded-full overflow-hidden">
              <div
                className={`h-full ${crisis ? "bg-accent-red" : tension >= 3 ? "bg-amber-500" : "bg-gray-500"} transition-all duration-700`}
                style={{
                  width: `${Math.min(100, Math.round(((tension + 1) / Math.max(1, tensionMax + 1)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs font-mono text-gray-300">{questionsLeft}</span>
            <span className="text-xs font-mono text-gray-300">QUESTIONS LEFT</span>
          </div>

          {/* Suspicion toggle */}
          <button
            onClick={() => setShowSuspicion((s) => !s)}
            className={`text-xs uppercase px-2 py-1 border transition-colors ${
              showSuspicion
                ? "border-gray-400 text-gray-200"
                : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
            }`}
            title="Suspicion matrix"
          >
            Matrix
          </button>

          {/* TTS toggle */}
          <button
            onClick={() => send({ type: "set_tts", enabled: !ttsEnabled })}
            className={`text-xs uppercase px-2 py-1 border transition-colors ${
              ttsEnabled
                ? "border-emerald-600 text-emerald-400 hover:border-emerald-400"
                : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
            }`}
            title={ttsEnabled ? "Voice on — click to mute" : "Voice off — click to enable"}
          >
            {ttsEnabled ? "Voice On" : "Voice Off"}
          </button>

          <button
            onClick={handleEjectClick}
            disabled={!!gameOver || !connected}
            className={`px-4 py-1.5 border text-xs uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              ejectUnlocked
                ? "border-accent-red text-accent-red hover:bg-accent-red hover:text-black"
                : "border-gray-600 text-gray-500 cursor-pointer"
            }`}
          >
            Eject
          </button>
        </div>
      </div>

      {/* Eject denied toast */}
      {ejectDeniedMsg && (
        <div className="bg-space-panel border-b border-amber-800 px-4 py-2 text-amber-400 text-xs uppercase text-center">
          {ejectDeniedMsg}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && streamingAgents.length === 0 && (
          <div className="text-center pt-10 space-y-2">
            <p className="text-gray-300 text-sm font-bold uppercase">You are the Captain</p>
            <p className="text-gray-400 text-sm">
              You have 5 questions to interrogate the crew and identify the traitor.
            </p>
            <p className="text-gray-400 text-sm">
              Type a message or <span className="text-gray-300">hold the mic button</span> to speak
              directly to the crew.
            </p>
          </div>
        )}

        {messages.map((msg) =>
          msg.speaker === "system" ? (
            <SystemMessage key={msg.id} content={msg.content} />
          ) : (
            <Message key={msg.id} message={msg} />
          ),
        )}

        {/* Live streaming bubbles */}
        {streamingAgents.map((agent) => (
          <Message
            key={`stream-${agent}`}
            message={{
              id: `stream-${agent}`,
              speaker: agent,
              content: drain.streamingText[agent] ?? "",
              timestamp: Date.now(),
              streaming: true,
            }}
          />
        ))}

        {/* Skeleton + typing indicators */}
        {awaitingCrew && typingAgents.length === 0 && streamingAgents.length === 0 && <TypingRow />}
        {typingAgents.map((agent) => (
          <TypingRow key={agent} agent={agent} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-space-border bg-space-dark px-4 py-3 shrink-0">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Comms status + quick prompts row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-mono uppercase shrink-0 ${statusTone}`}>
              {commsStatus}
            </span>
            <span className="text-xs text-gray-400 font-mono uppercase shrink-0 hidden sm:inline">
              ·
            </span>
            <p className="text-xs text-gray-500 font-mono uppercase hidden sm:inline">
              Quick prompts
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {suggestedPrompts.map((p, idx) => {
              const active = activeLine === idx;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setInput(p);
                    setActiveLine(2);
                    focusInputToEnd();
                  }}
                  disabled={!connected || !!gameOver}
                  className={`flex items-center gap-1.5 px-2.5 py-1 border text-sm transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${
                    active
                      ? "border-accent-cyan/50 text-gray-100 bg-accent-cyan/5"
                      : "border-space-border/50 text-gray-400 hover:border-space-border hover:text-gray-200"
                  }`}
                >
                  <span className="font-mono text-xs text-gray-600 shrink-0">{idx + 1}</span>
                  <span>{p}</span>
                </button>
              );
            })}
          </div>

          {/* Input line */}
          <div className="px-2 py-2 flex items-center gap-2">
            <VoiceButton
              recording={recording}
              transcribing={transcribing}
              disabled={!canAsk}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
            />
            <input
              type="text"
              ref={inputRef}
              value={input}
              onFocus={() => setActiveLine(2)}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!connected || !!gameOver || crisis}
              placeholder={
                gameOver
                  ? "Game over"
                  : crisis
                    ? "No more questions. Eject a suspect."
                    : crewBusy || streamingAgents.length > 0
                      ? "Crew responding..."
                      : "Write your own question for the crew..."
              }
              className="flex-1 bg-space-black/40 border-2 border-gray-400 px-3 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-300 hover:border-gray-300 disabled:opacity-40 transition-colors"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={
                !input.trim() ||
                !!gameOver ||
                !connected ||
                crewBusy ||
                streamingAgents.length > 0 ||
                crisis
              }
              className="px-6 py-3 border-2 border-accent-cyan text-accent-cyan text-sm uppercase font-mono font-bold hover:bg-accent-cyan hover:text-black transition-all opacity-80 disabled:cursor-not-allowed"
              title="Send (Enter)"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-space-border bg-space-dark px-4 py-2 shrink-0">
        <div className="mx-auto flex items-center justify-between gap-3 text-xs text-gray-500 font-mono">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-bold text-xs uppercase">AIRLOCK</span>
            <span className="text-gray-600 text-xs uppercase font-mono">Emergency Meeting</span>
          </div>

          <div
            className={`flex items-center gap-1.5 text-xs ${connected ? "text-emerald-500" : "text-gray-400"}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-gray-600"}`}
            />
            {connected ? "LIVE" : "RECONNECTING…"}
          </div>

          <div>
            by{" "}
            <a
              className="lowercase underline underline-offset-4 decoration-gray-600 hover:decoration-gray-300 hover:text-gray-300 transition-colors"
              href="https://agusbravo.dev"
              target="_blank"
              rel="noreferrer"
            >
              agustinbravop
            </a>
          </div>
        </div>
      </div>

      {/* Overlays */}
      {showSuspicion && (
        <SuspicionPanel
          matrix={suspicionMatrix}
          emotionalState={emotionalState}
          onClose={() => setShowSuspicion(false)}
        />
      )}
      {showEject && <EjectSelect onEject={handleEject} onClose={() => setShowEject(false)} />}
      {wrongEject && !gameOver && (
        <WrongEjectOverlay payload={wrongEject} onContinue={() => setWrongEject(null)} />
      )}
      {gameOver && <GameOver payload={gameOver} onReset={handleReset} />}
    </div>
  );
}
