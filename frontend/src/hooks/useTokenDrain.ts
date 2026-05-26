import { useCallback, useEffect, useRef, useState } from "react";

import { AgentName } from "../types";
import { enqueueAudio } from "./useAudio";

// Milliseconds between each displayed token — lower is faster.
export const DRAIN_MS = 150;
// Pause between one agent finishing and the next starting.
const INTER_AGENT_MS = 700;

interface AgentSlot {
  agent: AgentName;
  tokens: string[];
  done: boolean;
  audio?: string;
}

interface CommittedMessage {
  agent: AgentName;
  text: string;
  audio?: string;
}

interface Options {
  onCommit: (msg: CommittedMessage) => void;
  onSystemMessages: (contents: string[]) => void;
}

export interface TokenDrain {
  streamingText: Record<string, string>;
  streamingRef: React.MutableRefObject<Record<string, string>>;
  startAgent: (agent: AgentName) => void;
  pushToken: (agent: AgentName, token: string) => void;
  endAgent: (agent: AgentName, audio?: string) => void;
  /** Returns true if the message was held (drain busy), false if it should render immediately. */
  holdSystemMessage: (content: string) => boolean;
  isActive: () => boolean;
  hasPending: () => boolean;
  /** True whenever the drain has any work in-flight: active agent, pending agents, or inter-agent pause timer. */
  isDraining: () => boolean;
  stopDraining: () => void;
}

export function useTokenDrain({ onCommit, onSystemMessages }: Options): TokenDrain {
  const [streamingText, setStreamingText] = useState<Record<string, string>>({});
  const streamingRef = useRef<Record<string, string>>({});
  // Single FIFO queue — index 0 is the active agent being drained, 1+ are waiting.
  // pushToken and endAgent do one find() lookup on this array; no secondary slots.
  const agentQueueRef = useRef<AgentSlot[]>([]);
  const pendingSystemMessagesRef = useRef<string[]>([]);
  const drainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const interAgentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onSystemMessagesRef = useRef(onSystemMessages);
  onSystemMessagesRef.current = onSystemMessages;

  const drainQueues = useCallback(() => {
    const slot = agentQueueRef.current[0];
    if (!slot) {
      clearInterval(drainIntervalRef.current!);
      drainIntervalRef.current = null;
      const pending = pendingSystemMessagesRef.current.splice(0);
      if (pending.length > 0) onSystemMessagesRef.current(pending);
      return;
    }

    if (slot.tokens.length > 0) {
      streamingRef.current[slot.agent] =
        (streamingRef.current[slot.agent] ?? "") + slot.tokens.shift()!;
      setStreamingText({ ...streamingRef.current });
    }

    if (slot.tokens.length === 0 && slot.done) {
      const text = streamingRef.current[slot.agent] ?? "";
      delete streamingRef.current[slot.agent];
      agentQueueRef.current.shift();
      onCommitRef.current({ agent: slot.agent, text, audio: slot.audio });
      if (slot.audio) enqueueAudio(slot.audio);
      setStreamingText({ ...streamingRef.current });

      clearInterval(drainIntervalRef.current!);
      drainIntervalRef.current = null;

      if (agentQueueRef.current.length > 0) {
        interAgentTimerRef.current = setTimeout(() => {
          interAgentTimerRef.current = null;
          activateHead();
        }, INTER_AGENT_MS);
      } else {
        const pending = pendingSystemMessagesRef.current.splice(0);
        if (pending.length > 0) onSystemMessagesRef.current(pending);
      }
    }
  }, []);

  function activateHead() {
    const slot = agentQueueRef.current[0];
    if (!slot) return;
    streamingRef.current[slot.agent] = "";
    setStreamingText({ ...streamingRef.current });
    drainIntervalRef.current = setInterval(drainQueues, DRAIN_MS);
  }

  useEffect(
    () => () => {
      if (drainIntervalRef.current) clearInterval(drainIntervalRef.current);
      if (interAgentTimerRef.current) clearTimeout(interAgentTimerRef.current);
    },
    [],
  );

  function stopDraining() {
    streamingRef.current = {};
    agentQueueRef.current = [];
    pendingSystemMessagesRef.current = [];
    setStreamingText({});
    if (drainIntervalRef.current) {
      clearInterval(drainIntervalRef.current);
      drainIntervalRef.current = null;
    }
    if (interAgentTimerRef.current) {
      clearTimeout(interAgentTimerRef.current);
      interAgentTimerRef.current = null;
    }
  }

  function startAgent(agent: AgentName) {
    agentQueueRef.current.push({ agent, tokens: [], done: false });
    // Activate immediately only when nothing else is running.
    // If a drain or inter-agent timer is in progress, activateHead() will be
    // called naturally when the current head commits.
    if (agentQueueRef.current.length === 1 && !interAgentTimerRef.current) {
      activateHead();
    }
  }

  function pushToken(agent: AgentName, token: string) {
    const slot = agentQueueRef.current.find((s) => s.agent === agent && !s.done);
    if (slot) slot.tokens.push(token);
  }

  function endAgent(agent: AgentName, audio?: string) {
    const slot = agentQueueRef.current.find((s) => s.agent === agent && !s.done);
    if (slot) {
      slot.done = true;
      slot.audio = audio;
    }
  }

  function holdSystemMessage(content: string): boolean {
    const busy = agentQueueRef.current.length > 0 || interAgentTimerRef.current !== null;
    if (busy) {
      pendingSystemMessagesRef.current.push(content);
      return true;
    }
    return false;
  }

  return {
    streamingText,
    streamingRef,
    startAgent,
    pushToken,
    endAgent,
    holdSystemMessage,
    isActive: () => drainIntervalRef.current !== null,
    hasPending: () => agentQueueRef.current.length > 1,
    isDraining: () => agentQueueRef.current.length > 0 || interAgentTimerRef.current !== null,
    stopDraining,
  };
}
