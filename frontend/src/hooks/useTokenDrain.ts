import { useCallback, useEffect, useRef, useState } from "react";

import { AgentName } from "../types";
import { enqueueAudio } from "./useAudio";

// Milliseconds between each displayed token — lower is faster.
export const DRAIN_MS = 40;
// Pause between one agent finishing and the next starting.
const INTER_AGENT_MS = 700;

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
  stopDraining: () => void;
}

export function useTokenDrain({ onCommit, onSystemMessages }: Options): TokenDrain {
  const [streamingText, setStreamingText] = useState<Record<string, string>>({});
  const streamingRef = useRef<Record<string, string>>({});
  const tokenQueueRef = useRef<Record<string, string[]>>({});
  const streamDoneRef = useRef<Record<string, { audio?: string }>>({});
  const pendingAgentsRef = useRef<
    Array<{ agent: AgentName; tokens: string[]; done: boolean; audio?: string }>
  >([]);
  const pendingSystemMessagesRef = useRef<string[]>([]);
  const drainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const interAgentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs so drainQueues can call these without listing them as deps.
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onSystemMessagesRef = useRef(onSystemMessages);
  onSystemMessagesRef.current = onSystemMessages;

  const drainQueues = useCallback(() => {
    let changed = false;
    const toCommit: Array<{ agent: string; audio?: string }> = [];

    for (const agent of Object.keys(tokenQueueRef.current)) {
      const queue = tokenQueueRef.current[agent];
      if (queue.length > 0) {
        streamingRef.current[agent] = (streamingRef.current[agent] ?? "") + queue.shift()!;
        changed = true;
      }
      if (queue.length === 0 && agent in streamDoneRef.current) {
        toCommit.push({ agent, audio: streamDoneRef.current[agent].audio });
        delete tokenQueueRef.current[agent];
        delete streamDoneRef.current[agent];
      }
    }

    for (const { agent, audio } of toCommit) {
      const text = streamingRef.current[agent] ?? "";
      delete streamingRef.current[agent];
      onCommitRef.current({ agent: agent as AgentName, text, audio });
      if (audio) enqueueAudio(audio);
      changed = true;
    }

    if (changed) setStreamingText({ ...streamingRef.current });

    if (Object.keys(tokenQueueRef.current).length === 0) {
      const next = pendingAgentsRef.current.shift();
      if (next) {
        clearInterval(drainIntervalRef.current!);
        drainIntervalRef.current = null;
        interAgentTimerRef.current = setTimeout(() => {
          interAgentTimerRef.current = null;
          streamingRef.current[next.agent] = "";
          tokenQueueRef.current[next.agent] = next.tokens;
          setStreamingText({ ...streamingRef.current });
          if (next.done) streamDoneRef.current[next.agent] = { audio: next.audio };
          drainIntervalRef.current = setInterval(drainQueues, DRAIN_MS);
        }, INTER_AGENT_MS);
        return;
      }

      const pending = pendingSystemMessagesRef.current.splice(0);
      if (pending.length > 0) onSystemMessagesRef.current(pending);
      clearInterval(drainIntervalRef.current!);
      drainIntervalRef.current = null;
    }
  }, []);

  const ensureDraining = useCallback(() => {
    if (drainIntervalRef.current) return;
    drainIntervalRef.current = setInterval(drainQueues, DRAIN_MS);
  }, [drainQueues]);

  useEffect(
    () => () => {
      if (drainIntervalRef.current) clearInterval(drainIntervalRef.current);
      if (interAgentTimerRef.current) clearTimeout(interAgentTimerRef.current);
    },
    [],
  );

  function stopDraining() {
    streamingRef.current = {};
    tokenQueueRef.current = {};
    streamDoneRef.current = {};
    pendingAgentsRef.current = [];
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
    if (Object.keys(tokenQueueRef.current).length === 0 && pendingAgentsRef.current.length === 0) {
      streamingRef.current = { ...streamingRef.current, [agent]: "" };
      tokenQueueRef.current[agent] = [];
      setStreamingText({ ...streamingRef.current });
    } else {
      pendingAgentsRef.current.push({ agent, tokens: [], done: false });
    }
  }

  function pushToken(agent: AgentName, token: string) {
    if (tokenQueueRef.current[agent] !== undefined) {
      tokenQueueRef.current[agent].push(token);
      ensureDraining();
    } else {
      const slot = pendingAgentsRef.current.find((p) => p.agent === agent);
      if (slot) slot.tokens.push(token);
    }
  }

  function endAgent(agent: AgentName, audio?: string) {
    if (agent in tokenQueueRef.current || agent in streamDoneRef.current) {
      streamDoneRef.current[agent] = { audio };
    } else {
      const slot = pendingAgentsRef.current.find((p) => p.agent === agent);
      if (slot) {
        slot.done = true;
        slot.audio = audio;
      }
    }
  }

  function holdSystemMessage(content: string): boolean {
    const busy =
      Object.keys(tokenQueueRef.current).length > 0 ||
      Object.keys(streamDoneRef.current).length > 0 ||
      pendingAgentsRef.current.length > 0;
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
    isActive: () => Object.keys(tokenQueueRef.current).length > 0,
    hasPending: () => pendingAgentsRef.current.length > 0,
    stopDraining,
  };
}
