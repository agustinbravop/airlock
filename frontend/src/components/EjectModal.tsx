import { AgentName, GameOverPayload, WrongEjectPayload } from "../types";

const AGENTS: AgentName[] = ["daisy", "nova", "flint"];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const AGENT_ROLES: Record<AgentName, string> = {
  daisy: "Botanist",
  nova: "Navigator",
  flint: "Engineer",
};

// ── Eject target selector ────────────────────────────────────────────────────

interface EjectSelectProps {
  onEject: (target: AgentName) => void;
  onClose: () => void;
}

export function EjectSelect({ onEject, onClose }: EjectSelectProps) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 font-mono">
      <div className="bg-space-dark border border-accent-red p-8 max-w-sm w-full mx-4">
        <h2 className="text-accent-red font-bold uppercase text-sm mb-2">Eject Crew Member</h2>
        <p className="text-gray-200 text-xs mb-6">This is irreversible. Choose carefully.</p>
        <div className="space-y-3 mb-6">
          {AGENTS.map((agent) => (
            <button
              key={agent}
              onClick={() => onEject(agent)}
              className="w-full flex items-center gap-3 px-4 py-3 border border-space-border hover:border-accent-red hover:text-accent-red text-gray-200 transition-all duration-150 text-left"
            >
              <span className="font-bold capitalize">{agent}</span>
              <span className="text-xs text-gray-300 uppercase">{AGENT_ROLES[agent]}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full py-2 text-xs text-gray-300 hover:text-white transition-colors uppercase"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Wrong ejection overlay ───────────────────────────────────────────────────

interface WrongEjectProps {
  payload: WrongEjectPayload;
  onContinue: () => void;
}

export function WrongEjectOverlay({ payload, onContinue }: WrongEjectProps) {
  const name = capitalize(payload.ejected);
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 font-mono">
      <div className="bg-space-dark border border-amber-600 p-10 max-w-sm w-full mx-4 text-center">
        <div className="text-4xl font-bold text-amber-400 mb-4">WRONG EJECT</div>
        <p className="text-gray-200 mb-2">
          <span className="font-bold text-white">{name}</span> was innocent.
        </p>
        <p className="text-gray-200 text-sm mb-8">
          The traitor is still aboard. You have one last chance to find them.
        </p>
        <button
          onClick={onContinue}
          className="px-8 py-3 border border-amber-600 text-amber-400 hover:bg-amber-600 hover:text-black transition-all text-xs uppercase"
        >
          Continue Investigation
        </button>
      </div>
    </div>
  );
}

// ── Game over reveal ─────────────────────────────────────────────────────────

interface GameOverProps {
  payload: GameOverPayload;
  onReset: () => void;
}

export function GameOver({ payload, onReset }: GameOverProps) {
  const ejectedName = capitalize(payload.ejected);
  const traitorName = capitalize(payload.traitor);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 font-mono overflow-y-auto py-8">
      <div className="bg-space-dark border border-space-border p-8 max-w-lg w-full mx-4">
        {/* Result */}
        <div
          className={`text-4xl font-bold mb-3 text-center ${payload.won ? "text-emerald-400" : "text-accent-red"}`}
        >
          {payload.won ? "TRAITOR FOUND" : "MISSION FAILED"}
        </div>
        {payload.second_chance_used && (
          <p className="text-center text-amber-400 text-xs uppercase mb-4">Second chance used</p>
        )}

        <div className="border border-space-border p-4 mb-6 space-y-2">
          <p className="text-xs text-gray-400 uppercase">Incident Report</p>
          <p className="text-gray-200">
            {ejectedName} was ejected.{" "}
            {payload.won ? (
              <span className="text-emerald-400 font-bold">They were the traitor.</span>
            ) : (
              <>
                <span className="text-accent-red font-bold">{ejectedName} was innocent.</span> The
                traitor was <span className="font-bold text-accent-red">{traitorName}</span>.
              </>
            )}
          </p>
        </div>

        {/* Clue reveal */}
        {payload.clues.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-gray-300 uppercase mb-3">
              Key Clues You {payload.won ? "Found" : "Missed"}
            </p>
            <div className="space-y-3">
              {payload.clues.map((c, i) => (
                <div key={i} className="border border-space-border p-3 text-sm">
                  <p className="text-gray-300 text-xs uppercase mb-1">{capitalize(c.speaker)}</p>
                  <p className="text-gray-100 italic mb-1">"{c.quote}"</p>
                  <p className="text-gray-200 text-xs">{c.clue}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onReset}
          className="w-full py-3 border border-gray-600 text-gray-300 hover:border-white hover:text-white transition-all text-xs uppercase"
        >
          New Game
        </button>
      </div>
    </div>
  );
}
