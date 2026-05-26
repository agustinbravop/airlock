import { type KeyboardEvent, type RefObject } from "react";
import { GameOverPayload } from "../types";
import VoiceButton from "./VoiceButton";

interface Props {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  inputRef: RefObject<HTMLInputElement>;
  canAsk: boolean;
  connected: boolean;
  gameOver: GameOverPayload | null;
  crisis: boolean;
  crewBusy: boolean;
  streamingCount: number;
  commsStatus: string;
  statusTone: string;
  questionsLeft: number;
  suggestedPrompts: [string, string];
  onPromptClick: (p: string) => void;
  recording: boolean;
  transcribing: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export default function ChatInput({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  inputRef,
  canAsk,
  connected,
  gameOver,
  crisis,
  crewBusy,
  streamingCount,
  commsStatus,
  statusTone,
  questionsLeft,
  suggestedPrompts,
  onPromptClick,
  recording,
  transcribing,
  onStartRecording,
  onStopRecording,
}: Props) {
  return (
    <div className="border-t border-space-border bg-space-dark px-4 py-3 shrink-0">
      <div className="max-w-4xl mx-auto space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-mono uppercase shrink-0 ${statusTone}`}>
            {commsStatus}
          </span>
          <span className="text-xs text-gray-400 font-mono uppercase shrink-0 hidden sm:inline">
            ·
          </span>
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs font-mono text-gray-300">{questionsLeft}</span>
            <span className="text-xs font-mono text-gray-300">QUESTIONS LEFT</span>
          </div>
          {!crisis && (
            <span className="text-xs text-gray-400 font-mono uppercase shrink-0 hidden sm:inline">
              ·
            </span>
          )}
          {!crisis && (
            <p className="text-xs text-gray-500 font-mono uppercase hidden sm:inline">
              Quick prompts:
            </p>
          )}
        </div>

        {!crisis && (
          <div className="flex gap-3">
            {suggestedPrompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPromptClick(p)}
                disabled={!connected || !!gameOver}
                className="flex items-center gap-1.5 px-2.5 py-1 border text-xs transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed border-space-border/50 text-gray-400 hover:border-space-border hover:text-gray-200"
              >
                <span className="truncate">{p}</span>
              </button>
            ))}
          </div>
        )}

        <div className="py-2 flex items-center gap-2">
          <VoiceButton
            recording={recording}
            transcribing={transcribing}
            disabled={!canAsk}
            onMouseDown={onStartRecording}
            onMouseUp={onStopRecording}
          />
          <input
            type="text"
            ref={inputRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!connected || !!gameOver || crisis}
            placeholder={
              gameOver && !gameOver.won
                ? "Channel offline."
                : gameOver
                  ? "Game over"
                  : crisis
                    ? "No more questions. Eject a suspect."
                    : crewBusy || streamingCount > 0
                      ? "Crew responding..."
                      : "Write your own question for the crew..."
            }
            className="flex-1 bg-space-black/40 border-2 border-gray-400 px-3 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-300 hover:border-gray-300 disabled:opacity-40 transition-colors"
          />
          <button
            onClick={onSend}
            disabled={
              !input.trim() || !!gameOver || !connected || crewBusy || streamingCount > 0 || crisis
            }
            className="px-6 py-3 border-2 border-accent-cyan text-accent-cyan text-sm uppercase font-mono font-bold hover:bg-accent-cyan hover:text-black transition-all opacity-80 disabled:cursor-not-allowed"
            title="Send (Enter)"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
