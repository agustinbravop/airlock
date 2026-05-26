import { useEffect, useState } from "react";
import daisyPfp from "../assets/daisy.png";
import daisyHoverPfp from "../assets/daisy_hover.png";
import novaPfp from "../assets/nova.png";
import novaHoverPfp from "../assets/nova_hover.png";
import flintPfp from "../assets/flint.png";
import flintHoverPfp from "../assets/flint_hover.png";
import { AgentName, GameOverPayload } from "../types";

const AGENTS: AgentName[] = ["daisy", "nova", "flint"];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const AGENT_ROLES: Record<AgentName, string> = {
  daisy: "Botanist",
  nova: "Navigator",
  flint: "Engineer",
};
const AGENT_PFPS: Record<AgentName, string> = { daisy: daisyPfp, nova: novaPfp, flint: flintPfp };
const AGENT_HOVER_PFPS: Record<AgentName, string> = {
  daisy: daisyHoverPfp,
  nova: novaHoverPfp,
  flint: flintHoverPfp,
};
const AGENT_BG: Record<AgentName, string> = {
  daisy: "bg-emerald-700",
  nova: "bg-blue-700",
  flint: "bg-orange-700",
};

// ── Eject target selector ────────────────────────────────────────────────────

interface EjectSelectProps {
  onEject: (target: AgentName) => void;
  onClose: () => void;
}

export function EjectSelect({ onEject, onClose }: EjectSelectProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-black/85 flex items-center justify-center z-50 font-mono transition-opacity duration-1000 ${visible ? "opacity-100" : "opacity-0"}`}
      onClick={onClose}
    >
      <div
        className="bg-space-dark border border-accent-red p-8 max-w-2xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-accent-red font-bold uppercase text-md mb-1 text-center">
          Eject the traitor
        </h2>
        <p className="text-gray-400 text-sm mb-8 text-center">You only have one chance, Captain</p>
        <div className="flex justify-center gap-6 mb-8">
          {AGENTS.map((agent) => (
            <button
              key={agent}
              onClick={() => onEject(agent)}
              className="flex flex-col items-center group"
            >
              <div
                className={`w-44 h-44 ${AGENT_BG[agent]} border-4 border-transparent group-hover:border-accent-red transition-all duration-150 overflow-hidden relative mb-2`}
              >
                <img
                  src={AGENT_PFPS[agent]}
                  alt={agent}
                  className="w-full h-full object-cover absolute inset-0 group-hover:opacity-0"
                  style={{ imageRendering: "pixelated" }}
                  draggable={false}
                />
                <img
                  src={AGENT_HOVER_PFPS[agent]}
                  alt={agent}
                  className="w-full h-full object-cover absolute inset-0 opacity-0 group-hover:opacity-100"
                  style={{ imageRendering: "pixelated" }}
                  draggable={false}
                />
              </div>
              <span className="text-md font-bold capitalize text-gray-200 group-hover:text-accent-red transition-colors">
                {agent}
              </span>
              <span className="text-sm text-gray-500 uppercase">{AGENT_ROLES[agent]}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 text-xs border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-all uppercase"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Game over reveal ─────────────────────────────────────────────────────────

interface GameOverProps {
  payload: GameOverPayload;
  onReset: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export function GameOver({ payload, onReset, onMinimize, onClose }: GameOverProps) {
  const ejectedName = capitalize(payload.ejected);
  const traitorName = capitalize(payload.traitor);

  return (
    <div
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 font-mono overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-space-dark border border-space-border p-8 max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Result */}
        <div
          className={`text-4xl font-bold mb-3 text-center ${payload.won ? "text-emerald-400" : "text-accent-red"}`}
        >
          {payload.won ? "TRAITOR FOUND" : "MISSION FAILED"}
        </div>
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

        {/* Single most important clue */}
        {payload.clues[0] && (
          <div className="mb-6">
            <p className="text-xs text-gray-300 uppercase mb-3">
              {payload.won ? "The clue that gave it away" : "The clue you missed"}
            </p>
            <div className="border border-space-border p-3 text-sm">
              <p className="text-gray-300 text-xs uppercase mb-1">
                {capitalize(payload.clues[0].speaker)}
              </p>
              <p className="text-gray-100 italic mb-1">"{payload.clues[0].quote}"</p>
              <p className="text-gray-200 text-xs">{payload.clues[0].clue}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={onMinimize}
            className="px-4 py-2 border border-gray-700 text-gray-500 hover:border-gray-400 hover:text-gray-200 transition-all text-xs uppercase"
          >
            Review Conversation ↓
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 border border-gray-600 text-gray-300 hover:border-white hover:text-white transition-all text-xs uppercase"
          >
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
