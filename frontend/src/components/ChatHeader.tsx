import { AgentName, GameOverPayload } from "../types";
import SuspicionPanel from "./SuspicionPanel";

const AGENT_TEXT: Record<AgentName, string> = {
  daisy: "text-emerald-400",
  nova: "text-blue-400",
  flint: "text-orange-400",
};

interface Props {
  emotionalState: Record<string, string>;
  tension: number;
  tensionMax: number;
  crisis: boolean;
  showSuspicion: boolean;
  onToggleSuspicion: () => void;
  suspicionMatrix: Record<string, Record<string, number>>;
  ttsEnabled: boolean;
  onToggleTts: () => void;
  gameOver: GameOverPayload | null;
  connected: boolean;
  ejectUnlocked: boolean;
  onEjectClick: () => void;
}

export default function ChatHeader({
  emotionalState,
  tension,
  tensionMax,
  crisis,
  showSuspicion,
  onToggleSuspicion,
  suspicionMatrix,
  ttsEnabled,
  onToggleTts,
  gameOver,
  connected,
  ejectUnlocked,
  onEjectClick,
}: Props) {
  return (
    <div className="border-b border-space-border bg-space-dark px-4 py-2 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase shrink-0 hidden sm:inline">Crew:</span>
        <div className="flex items-center gap-4">
          {(["daisy", "nova", "flint"] as AgentName[]).map((agent) => (
            <div key={agent} className="flex items-center gap-1">
              <span className={`text-xs uppercase ${AGENT_TEXT[agent]}`}>{agent}</span>
              {emotionalState[agent] && (
                <span className="text-xs text-gray-500 hidden sm:inline">
                  {emotionalState[agent]}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
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

        <div className="relative">
          <button
            onClick={onToggleSuspicion}
            className={`text-xs uppercase px-2 py-1 border transition-colors ${
              showSuspicion
                ? "border-gray-400 text-gray-200"
                : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
            }`}
            title="Suspicion matrix"
          >
            Matrix
          </button>
          {showSuspicion && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/70"
                onClick={onToggleSuspicion}
                aria-label="Close suspicion panel"
              />
              <div className="absolute top-full left-0 mt-1 z-50">
                <SuspicionPanel
                  matrix={suspicionMatrix}
                  emotionalState={emotionalState}
                  onClose={onToggleSuspicion}
                />
              </div>
            </>
          )}
        </div>

        <button
          onClick={onToggleTts}
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
          onClick={onEjectClick}
          disabled={!!gameOver || !connected || !ejectUnlocked}
          className={`px-4 py-1 border text-xs uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
            ejectUnlocked
              ? "border-accent-red text-accent-red hover:bg-accent-red hover:text-black"
              : "border-gray-600 text-gray-500 cursor-pointer"
          }`}
        >
          Eject the traitor
        </button>
      </div>
    </div>
  );
}
