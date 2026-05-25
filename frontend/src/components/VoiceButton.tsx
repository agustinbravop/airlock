interface Props {
  recording: boolean;
  transcribing: boolean;
  disabled?: boolean;
  onMouseDown: () => void;
  onMouseUp: () => void;
}

export default function VoiceButton({
  recording,
  transcribing,
  disabled,
  onMouseDown,
  onMouseUp,
}: Props) {
  return (
    <button
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchStart={onMouseDown}
      onTouchEnd={onMouseUp}
      disabled={transcribing || !!disabled}
      className={`w-[2.95rem] h-[2.95rem] flex items-center justify-center shrink-0 transition-all duration-150 focus:outline-none border-2 font-mono ${
        recording
          ? "bg-accent-red border-accent-red text-white"
          : transcribing || disabled
            ? "border-gray-400 text-gray-400 cursor-not-allowed"
            : "border-gray-400 text-gray-300 hover:border-gray-300 hover:text-white"
      }`}
      title={recording ? "Release to send" : "Hold to speak"}
    >
      {transcribing ? (
        <span className="text-[10px]">...</span>
      ) : (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      )}
    </button>
  );
}
