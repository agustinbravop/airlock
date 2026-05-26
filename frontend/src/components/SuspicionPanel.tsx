import { AgentName } from "../types";

const AGENTS: AgentName[] = ["daisy", "nova", "flint"];

const AGENT_COLORS: Record<AgentName, string> = {
  daisy: "text-emerald-400",
  flint: "text-orange-400",
  nova: "text-blue-400",
};

function heatColor(val: number): string {
  // 0.0 → green, 0.5 → yellow, 1.0 → red
  if (val < 0.3) return "bg-emerald-900 text-emerald-300";
  if (val < 0.5) return "bg-yellow-900 text-yellow-300";
  if (val < 0.7) return "bg-orange-900 text-orange-300";
  return "bg-red-900 text-red-300";
}

interface Props {
  matrix: Record<string, Record<string, number>>;
  emotionalState: Record<string, string>;
  onClose: () => void;
}

export default function SuspicionPanel({ matrix, emotionalState, onClose }: Props) {
  return (
    <div className="bg-space-dark border border-space-border p-4 w-72 font-mono shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-200 uppercase">Suspicion Matrix</span>
        <button onClick={onClose} className="text-gray-200 hover:text-white text-xs">
          ✕
        </button>
      </div>

      {/* Grid */}
      <div className="mb-4">
        {/* Header row */}
        <div className="grid grid-cols-4 gap-1 mb-1">
          <div />
          {AGENTS.map((a) => (
            <div key={a} className={`text-center text-xs font-bold uppercase ${AGENT_COLORS[a]}`}>
              {a}
            </div>
          ))}
        </div>

        {/* Data rows: who suspects whom */}
        {AGENTS.map((from) => (
          <div key={from} className="grid grid-cols-4 gap-1 mb-1 items-center">
            <div className={`text-xs font-bold uppercase ${AGENT_COLORS[from]} text-right pr-1`}>
              {from}
            </div>
            {AGENTS.map((target) => {
              if (from === target) {
                return (
                  <div
                    key={target}
                    className="h-6 bg-space-border rounded flex items-center justify-center text-gray-300 text-xs"
                  >
                    —
                  </div>
                );
              }
              const val = matrix[from]?.[target] ?? 0;
              return (
                <div
                  key={target}
                  className={`h-6 rounded flex items-center justify-center text-xs font-mono ${heatColor(val)}`}
                  title={`${from} → ${target}: ${(val * 100).toFixed(0)}%`}
                >
                  {(val * 100).toFixed(0)}
                </div>
              );
            })}
          </div>
        ))}

        <p className="text-gray-200 text-xs mt-1">Row suspects column (%)</p>
      </div>

      {/* Emotional states */}
      <div className="border-t border-space-border pt-3 space-y-1">
        <p className="text-xs text-gray-200 uppercase mb-2">Emotional State</p>
        {AGENTS.map((agent) => (
          <div key={agent} className="flex justify-between items-center">
            <span className={`text-xs font-bold uppercase ${AGENT_COLORS[agent]}`}>{agent}</span>
            <span className="text-xs text-gray-100 capitalize">{emotionalState[agent] ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
