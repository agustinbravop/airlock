import { useEffect, useRef, useState, useCallback } from "react";
import { ChatMessage, AgentName, GameOverPayload, TypingState, ServerMessage } from "../types";
import Message from "./Message";
import { EjectSelect, GameOver } from "./EjectModal";
import ChatHeader from "./ChatHeader";
import ChatInput from "./ChatInput";
import { SystemMessage, TypingRow } from "./SystemMessages";
import { DEFAULT_TYPING_STATE, PROMPTS_BY_TENSION } from "./chatConstants";
import { useWebSocket } from "../hooks/useWebSocket";
import { enqueueAudio, stopAudio, useAudioRecorder } from "../hooks/useAudio";
import { useTokenDrain } from "../hooks/useTokenDrain";

const AUTO_EJECT_GATE_MESSAGE = "We're in crisis. Eject a suspect now.";
const MODAL_DELAY_MS = 2000;

function nextIdFrom(ref: { current: number }) {
  ref.current += 1;
  return String(ref.current);
}

export default function Chat() {
  const msgIdRef = useRef(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [input, setInput] = useState("");
  const [typing, setTyping] = useState<TypingState>(() => ({ ...DEFAULT_TYPING_STATE }));
  const [showEject, setShowEject] = useState(false);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
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
  const [gameOverMinimized, setGameOverMinimized] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFocusedOnConnect = useRef(false);
  const hasAutoOpenedEjectRef = useRef(false);
  const pendingEjectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingGameOverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crisis = tension >= tensionMax;
  const ejectUnlocked = crisis;

  useEffect(
    () => () => {
      if (pendingEjectTimerRef.current) clearTimeout(pendingEjectTimerRef.current);
      if (pendingGameOverTimerRef.current) clearTimeout(pendingGameOverTimerRef.current);
    },
    [],
  );

  const maybeAutoOpenEjectModal = useCallback(
    (contents: string[]) => {
      if (hasAutoOpenedEjectRef.current) return;
      if (!crisis || !!gameOver) return;
      if (!contents.includes(AUTO_EJECT_GATE_MESSAGE)) return;
      hasAutoOpenedEjectRef.current = true;

      // Wait until the last system message is visible, then delay.
      requestAnimationFrame(() => {
        pendingEjectTimerRef.current = setTimeout(() => {
          pendingEjectTimerRef.current = null;
          setShowEject(true);
        }, MODAL_DELAY_MS);
      });
    },
    [crisis, gameOver],
  );

  const showGameOverWithDelay = useCallback((payload: GameOverPayload) => {
    // Drain must be fully stopped already; ensure we delay the modal reveal.
    if (pendingGameOverTimerRef.current) clearTimeout(pendingGameOverTimerRef.current);
    pendingGameOverTimerRef.current = setTimeout(() => {
      pendingGameOverTimerRef.current = null;
      setGameOver(payload);
    }, MODAL_DELAY_MS);
  }, []);

  const drain = useTokenDrain({
    onCommit: useCallback(
      ({ agent, text }: { agent: AgentName; text: string }) => {
        setMessages((prev) => [
          ...prev,
          { id: nextIdFrom(msgIdRef), speaker: agent, content: text, timestamp: Date.now() },
        ]);
      },
      [msgIdRef],
    ),
    onSystemMessages: useCallback(
      (contents: string[]) => {
        setMessages((prev) => [
          ...prev,
          ...contents.map((content) => ({
            id: nextIdFrom(msgIdRef),
            speaker: "system" as AgentName,
            content,
            timestamp: Date.now(),
          })),
        ]);

        maybeAutoOpenEjectModal(contents);
      },
      [msgIdRef, maybeAutoOpenEjectModal],
    ),
  });

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
        if (!msg.enabled) stopAudio();
        break;

      case "player_message":
        setMessages((prev) => [
          ...prev,
          {
            id: nextIdFrom(msgIdRef),
            speaker: "player",
            content: msg.content,
            timestamp: Date.now(),
          },
        ]);
        break;

      case "typing_start":
        setAwaitingCrew(false);
        // Suppress if the drain has anything in-flight (active tokens, pending agents, or inter-agent timer).
        // Replace all flags so only one agent's indicator shows at a time.
        if (!drain.isDraining()) {
          setTyping({ ...DEFAULT_TYPING_STATE, [msg.agent]: true });
        }
        break;

      case "typing_stop":
        setTyping((t) => ({ ...t, [msg.agent]: false }));
        break;

      case "agent_stream_start":
        setAwaitingCrew(false);
        setTyping({ ...DEFAULT_TYPING_STATE });
        drain.startAgent(msg.agent);
        break;

      case "agent_stream_token":
        drain.pushToken(msg.agent, msg.token);
        break;

      case "agent_stream_audio":
        enqueueAudio(msg.audio);
        break;

      case "agent_stream_end":
        drain.endAgent(msg.agent, msg.audio);
        break;

      case "tension_update":
        setTension(msg.tension);
        setTensionMax(msg.tension_max);
        break;

      case "system_message":
        if (!drain.holdSystemMessage(msg.content)) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextIdFrom(msgIdRef),
              speaker: "system" as AgentName,
              content: msg.content,
              timestamp: Date.now(),
            },
          ]);

          maybeAutoOpenEjectModal([msg.content]);
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

      case "game_over":
        drain.stopDraining();
        setTyping({ ...DEFAULT_TYPING_STATE });
        setAwaitingCrew(false);
        if (msg.won) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextIdFrom(msgIdRef),
              speaker: "system" as const,
              content: "TRAITOR ELIMINATED.",
              timestamp: Date.now(),
            },
          ]);
        } else {
          if (msg.traitor_message) {
            setMessages((prev) => [
              ...prev,
              {
                id: nextIdFrom(msgIdRef),
                speaker: msg.traitor as AgentName,
                content: msg.traitor_message!,
                timestamp: Date.now(),
              },
            ]);
          }
          setMessages((prev) => [
            ...prev,
            {
              id: nextIdFrom(msgIdRef),
              speaker: "system" as const,
              content: "CHANNEL OFFLINE. COMMS SABOTAGED.",
              timestamp: Date.now(),
            },
          ]);
        }
        showGameOverWithDelay(msg);
        break;

      case "reset":
        drain.stopDraining();
        if (pendingEjectTimerRef.current) {
          clearTimeout(pendingEjectTimerRef.current);
          pendingEjectTimerRef.current = null;
        }
        if (pendingGameOverTimerRef.current) {
          clearTimeout(pendingGameOverTimerRef.current);
          pendingGameOverTimerRef.current = null;
        }
        setMessages([]);
        setTyping({ ...DEFAULT_TYPING_STATE });
        setGameOver(null);
        setTension(0);
        setTensionMax(5);
        setSuspicionMatrix({});
        setEmotionalState({});
        setPromptSeed(0);
        setAwaitingCrew(false);
        setGameOverMinimized(false);
        hasAutoOpenedEjectRef.current = false;
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

  const crewBusy = Object.values(typing).some(Boolean) || drain.isDraining();

  function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || gameOver || crewBusy || crisis) return;
    send({ type: "player_message", content: trimmed });
    setInput("");
    setAwaitingCrew(true);
    setTension((t) => Math.min(tensionMax, t + 1));
    setPromptSeed((n) => n + 1);
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
    if (gameOver) return;
    if (!ejectUnlocked) {
      setEjectDeniedMsg("Gather more information first.");
      setTimeout(() => setEjectDeniedMsg(null), 3000);
      return;
    }
    if (pendingEjectTimerRef.current) clearTimeout(pendingEjectTimerRef.current);
    pendingEjectTimerRef.current = setTimeout(() => {
      pendingEjectTimerRef.current = null;
      setShowEject(true);
    }, MODAL_DELAY_MS);
  }

  function handleEject(target: AgentName) {
    setShowEject(false);
    send({ type: "eject", target });
  }

  function handleReset() {
    if (pendingEjectTimerRef.current) {
      clearTimeout(pendingEjectTimerRef.current);
      pendingEjectTimerRef.current = null;
    }
    if (pendingGameOverTimerRef.current) {
      clearTimeout(pendingGameOverTimerRef.current);
      pendingGameOverTimerRef.current = null;
    }
    send({ type: "reset" });
    setGameOver(null);
    setGameOverMinimized(false);
    setMessages([]);
  }

  const typingAgents = (Object.keys(typing) as AgentName[]).filter((a) => typing[a]);
  const streamingAgents = Object.keys(drain.streamingText) as AgentName[];
  const canAsk = connected && !gameOver && !crewBusy && !crisis;

  const commsStatus = !connected
    ? "RECONNECTING"
    : gameOver && !gameOver.won
      ? "CHANNEL SABOTAGED"
      : gameOver
        ? "SESSION ENDED"
        : crisis
          ? "CRISIS"
          : crewBusy
            ? "CREW RESPONDING"
            : "CHANNEL OPEN";
  const statusTone = !connected
    ? "text-gray-400"
    : gameOver
      ? "text-accent-red"
      : crisis
        ? "text-accent-red"
        : crewBusy
          ? "text-accent-gray"
          : "text-accent-cyan";

  const questionsLeft = Math.max(0, tensionMax - tension);

  return (
    <div className="h-dvh bg-space-black flex flex-col font-mono">
      <ChatHeader
        emotionalState={emotionalState}
        tension={tension}
        tensionMax={tensionMax}
        crisis={crisis}
        showSuspicion={showSuspicion}
        onToggleSuspicion={() => setShowSuspicion((s) => !s)}
        suspicionMatrix={suspicionMatrix}
        ttsEnabled={ttsEnabled}
        onToggleTts={() => send({ type: "set_tts", enabled: !ttsEnabled })}
        gameOver={gameOver}
        connected={connected}
        ejectUnlocked={ejectUnlocked}
        onEjectClick={handleEjectClick}
      />

      {/* Eject denied toast */}
      {ejectDeniedMsg && (
        <div className="bg-space-panel border-b border-amber-800 px-4 py-2 text-amber-400 text-xs uppercase text-center">
          {ejectDeniedMsg}
        </div>
      )}

      {/* Minimized game-over bar */}
      {gameOver && gameOverMinimized && (
        <div
          className={`border-b px-4 py-2 flex items-center justify-between text-xs ${
            gameOver.won
              ? "bg-emerald-950/40 border-emerald-800/50"
              : "bg-red-950/30 border-accent-red/30"
          }`}
        >
          <button
            type="button"
            onClick={() => setGameOverMinimized(false)}
            className={`font-bold uppercase animate-pulse ${
              gameOver.won ? "text-emerald-400" : "text-accent-red"
            }`}
            title="View results"
          >
            {gameOver.won ? "✓ TRAITOR FOUND" : "✗ MISSION FAILED"}
          </button>
          <div className="flex items-center gap-5">
            <button
              onClick={() => setGameOverMinimized(false)}
              className="text-gray-400 hover:text-gray-300 uppercase transition-colors"
            >
              View Results
            </button>
            <button
              onClick={handleReset}
              className="text-gray-300 hover:text-gray-200 uppercase transition-colors"
            >
              New Game
            </button>
          </div>
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
            <SystemMessage
              key={msg.id}
              content={msg.content}
              crisis={crisis}
              onEjectClick={handleEjectClick}
            />
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
      <ChatInput
        input={input}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        onSend={() => sendMessage(input)}
        inputRef={inputRef}
        canAsk={canAsk}
        connected={connected}
        gameOver={gameOver}
        crisis={crisis}
        crewBusy={crewBusy}
        streamingCount={streamingAgents.length}
        commsStatus={commsStatus}
        statusTone={statusTone}
        questionsLeft={questionsLeft}
        suggestedPrompts={suggestedPrompts}
        onPromptClick={(p) => {
          setInput(p);
          focusInputToEnd();
        }}
        recording={recording}
        transcribing={transcribing}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
      />

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
      {showEject && <EjectSelect onEject={handleEject} onClose={() => setShowEject(false)} />}
      {gameOver && !gameOverMinimized && (
        <GameOver
          payload={gameOver}
          onReset={handleReset}
          onMinimize={() => setGameOverMinimized(true)}
          onClose={() => setGameOverMinimized(true)}
        />
      )}
    </div>
  );
}
