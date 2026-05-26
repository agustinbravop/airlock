import { useEffect, useState } from "react";
import { AgentName } from "../types";
import daisyPfp from "../assets/daisy.png";
import novaPfp from "../assets/nova.png";
import flintPfp from "../assets/flint.png";

const AGENT_PFPS: Record<AgentName, string> = { daisy: daisyPfp, nova: novaPfp, flint: flintPfp };
const AGENT_BG: Record<AgentName, string> = {
  daisy: "bg-emerald-700",
  nova: "bg-blue-700",
  flint: "bg-orange-700",
};

function WaitingDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-5 text-left tracking-tight">{".".repeat(count)}</span>;
}

export function SystemMessage({
  content,
  crisis,
  onEjectClick,
}: {
  content: string;
  crisis?: boolean;
  onEjectClick?: () => void;
}) {
  const isWaiting = content === "Crew waiting for Captain.";
  const isCrisisEject = /^We're in crisis\b/i.test(content);
  const isWin = content.startsWith("TRAITOR FOUND") || content === "TRAITOR ELIMINATED.";
  const isFail = content.startsWith("MISSION FAILED") || content.startsWith("CHANNEL OFFLINE");
  const isEjected = content.endsWith("was ejected.");

  if ((isWaiting && crisis) || isCrisisEject) {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={onEjectClick}
          className="text-accent-red text-xs font-bold uppercase border border-accent-red px-4 py-2 animate-pulse hover:bg-accent-red hover:text-black transition-colors"
          title="Eject a suspect"
        >
          ⚠ YOU MUST EJECT SOMEONE
        </button>
      </div>
    );
  }

  if (isWin) {
    return (
      <div className="text-center">
        <span className="text-emerald-400 text-xs font-bold uppercase border border-emerald-400/50 px-4 py-2 animate-pulse">
          ✓ {content}
        </span>
      </div>
    );
  }

  if (isFail) {
    return (
      <div className="text-center">
        <span className="text-accent-red text-xs font-bold uppercase border border-accent-red px-4 py-2 animate-pulse">
          ✗ {content}
        </span>
      </div>
    );
  }

  if (isEjected) {
    return (
      <div className="text-center">
        <span className="text-gray-200 text-xs font-bold uppercase px-4 py-2">{content}</span>
      </div>
    );
  }

  return (
    <div className="text-center">
      <span
        className={
          isWaiting
            ? "text-gray-300 text-xs uppercase px-3 py-1"
            : "text-accent-red text-xs uppercase px-3 py-1"
        }
      >
        {isWaiting ? (
          <>
            CREW WAITING FOR CAPTAIN
            <WaitingDots />
          </>
        ) : (
          <>{content}</>
        )}
      </span>
    </div>
  );
}

export function TypingRow({ agent }: { agent?: AgentName }) {
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
