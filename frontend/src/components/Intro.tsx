import { useState, useEffect } from "react";

interface Props {
  onEnter: () => void;
}

const LINES = [
  "Crewmate Sarah was ejected into the cold void of space while cleaning the Escape Capsule.",
  "Evidence suggests a traitor hiding among the crew.",
  "As the captain of this space station, you've called an emergency meeting.",
  "Use your microphone to question the crew.",
];

export default function Intro({ onEnter }: Props) {
  const [visibleLines, setVisibleLines] = useState(1);
  const showWarning = visibleLines >= LINES.length + 1;
  const showButton = visibleLines >= LINES.length + 2;
  const showTip = visibleLines >= LINES.length + 3;

  useEffect(() => {
    if (visibleLines <= LINES.length + 2) {
      const timer = setTimeout(() => setVisibleLines((v) => v + 1), 1100);
      return () => clearTimeout(timer);
    }
  }, [visibleLines]);

  return (
    <div className="min-h-screen bg-space-black flex flex-col items-center justify-center px-6 py-16 font-mono relative overflow-hidden">
      {/* Alarm flash: two slow dim pulses on load */}
      <div
        className="absolute inset-0 bg-accent-red pointer-events-none z-10"
        style={{ animation: "alarm-flashes 3s ease-out both" }}
      />
      {/* Faint ambient pulse: continues throughout */}
      <div
        className="absolute inset-0 bg-accent-red pointer-events-none z-10"
        style={{ animation: "alarm-pulse ease-in-out 2s infinite both" }}
      />
      <div className="w-full max-w-2xl mb-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-5xl font-bold text-white font-mono">
              <span style={{ animation: "alarm-letter-pulse 2s ease-in-out infinite both" }}>
                A
              </span>
              <span style={{ animation: "alarm-letter-pulse 2s ease-in-out infinite both" }}>
                I
              </span>
              RLOCK
            </h1>
            <span className="text-3xl text-gray-500 font-mono">EMERGENCY MEETING</span>
          </div>

          <button
            type="button"
            onClick={onEnter}
            className="airlock-chip text-sm mb-1"
            title="Skip briefing"
            aria-label="Skip briefing"
          >
            Skip Intro
          </button>
        </div>
      </div>

      {/* Incident briefing — all lines always in DOM so layout height stays fixed */}
      <div className="max-w-2xl w-full space-y-4">
        {LINES.map((line, i) => (
          <p
            key={i}
            className={`text-gray-200 text-lg leading-relaxed ${i < visibleLines ? "animate-fade-in" : "invisible"}`}
          >
            {line}
          </p>
        ))}
      </div>

      {/* Warning line */}
      <div className={`max-w-2xl w-full ${showWarning ? "animate-fade-in" : "invisible"}`}>
        <p className="text-accent-red font-bold text-base uppercase my-7 font-mono">
          Find the traitor and eject them before another crew member is killed.
        </p>
      </div>

      {/* CTA button */}
      <div className={`max-w-2xl w-full ${showButton ? "animate-fade-in" : "invisible"}`}>
        <button
          onClick={onEnter}
          className="w-full py-4 border border-accent-cyan/60 text-accent-cyan font-bold text-sm uppercase hover:bg-accent-cyan hover:text-black transition-all duration-200 focus:outline-none font-mono"
        >
          Enter Communication Channel
        </button>
      </div>

      {/* Tip */}
      <div className={`max-w-2xl w-full ${showTip ? "animate-fade-in" : "invisible"}`}>
        <p className="mt-3 text-sm text-gray-400 font-mono">
          Tip: hold the mic to transcribe, then edit before sending.
        </p>
      </div>
    </div>
  );
}
