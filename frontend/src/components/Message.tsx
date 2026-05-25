import { ChatMessage, AgentName } from "../types";

import daisyPfp from "../assets/daisy.png";
import novaPfp from "../assets/nova.png";
import flintPfp from "../assets/flint.png";

const AGENT_COLORS: Record<AgentName, string> = {
  daisy: "bg-emerald-700",
  nova: "bg-blue-700",
  flint: "bg-orange-700",
};

const AGENT_TEXT_COLORS: Record<AgentName, string> = {
  daisy: "text-emerald-400",
  nova: "text-blue-400",
  flint: "text-orange-400",
};

const AGENT_PFPS: Record<AgentName, string> = {
  daisy: daisyPfp,
  nova: novaPfp,
  flint: flintPfp,
};

function Avatar({ speaker }: { speaker: ChatMessage["speaker"] }) {
  if (speaker === "player") {
    return (
      <div className="w-[60px] h-[60px] bg-gray-700 border border-space-border flex items-center justify-center text-[10px] font-bold text-white shrink-0 font-mono">
        YOU
      </div>
    );
  }
  const agent = speaker as AgentName;
  const pfp = AGENT_PFPS[agent];
  const color = AGENT_COLORS[agent] ?? "bg-gray-700";
  return (
    <div
      className={`w-[108px] h-[108px] ${color} border border-space-border shrink-0 overflow-hidden`}
      style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)" }}
    >
      <img
        src={pfp}
        alt={agent}
        className="w-full h-full object-cover"
        style={{ imageRendering: "pixelated" }}
        draggable={false}
      />
    </div>
  );
}

interface Props {
  message: ChatMessage;
}

export default function Message({ message }: Props) {
  const isPlayer = message.speaker === "player";
  const name = isPlayer
    ? "You"
    : (message.speaker as string).charAt(0).toUpperCase() + (message.speaker as string).slice(1);
  const nameColor = isPlayer
    ? "text-gray-200"
    : (AGENT_TEXT_COLORS[message.speaker as AgentName] ?? "text-gray-200");

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex gap-3 ${isPlayer ? "flex-row-reverse" : "flex-row"}`}>
      <Avatar speaker={message.speaker} />
      <div
        className={`max-w-[72%] lg:max-w-[60%] ${isPlayer ? "items-end" : "items-start"} flex flex-col gap-1`}
      >
        <div className={`flex items-baseline gap-2 ${isPlayer ? "flex-row-reverse" : "flex-row"}`}>
          <span className={`text-xs font-bold uppercase font-mono ${nameColor}`}>{name}</span>
          <span className="text-xs text-gray-500 font-mono">{time}</span>
        </div>
        <div
          className={`px-4 py-3 text-sm leading-[1.55] ${
            isPlayer
              ? "bg-gray-700 text-white border border-space-border"
              : "bg-space-panel border border-space-border text-gray-100"
          }`}
          style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)" }}
        >
          <span className="font-sans" style={{ whiteSpace: "pre-wrap" }}>
            {message.content}
          </span>
          {message.streaming && (
            <span className="inline-block w-2 h-4 ml-1 align-middle airlock-caret">
              <span className="inline-block w-0.5 h-4 bg-gray-400" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
