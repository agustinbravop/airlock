export type AgentName = "daisy" | "nova" | "flint";

export interface ChatMessage {
  id: string;
  speaker: "player" | AgentName | "system";
  content: string;
  timestamp: number;
  audio?: string;
  streaming?: boolean;
}

export interface TypingState {
  daisy: boolean;
  nova: boolean;
  flint: boolean;
}

export interface GameOverPayload {
  ejected: AgentName;
  traitor: AgentName;
  won: boolean;
  second_chance_used: boolean;
  suspicion_matrix: Record<AgentName, Record<string, number>>;
  clues: Array<{ speaker: string; quote: string; clue: string }>;
}

export interface WrongEjectPayload {
  ejected: AgentName;
  traitor: AgentName;
  suspicion_matrix: Record<string, Record<string, number>>;
}

export type ServerMessage =
  | {
      type: "connected";
      agents: AgentName[];
      tension: number;
      tension_max: number;
      eject_unlocked: boolean;
      suspicion_matrix: Record<string, Record<string, number>>;
      emotional_state: Record<string, string>;
      tts_enabled: boolean;
    }
  | { type: "tts_state"; enabled: boolean }
  | { type: "player_message"; content: string }
  | { type: "agent_stream_start"; agent: AgentName; audio?: string }
  | { type: "agent_stream_token"; agent: AgentName; token: string }
  | { type: "agent_stream_end"; agent: AgentName; audio?: string }
  | { type: "typing_start"; agent: AgentName }
  | { type: "typing_stop"; agent: AgentName }
  | { type: "tension_update"; tension: number; tension_max: number }
  | { type: "system_message"; content: string }
  | { type: "eject_denied"; reason: string }
  | {
      type: "suspicion_update";
      matrix: Record<string, Record<string, number>>;
      emotional_state: Record<string, string>;
    }
  | {
      type: "wrong_eject";
      ejected: AgentName;
      traitor: AgentName;
      suspicion_matrix: Record<string, Record<string, number>>;
    }
  | {
      type: "game_over";
      ejected: AgentName;
      traitor: AgentName;
      won: boolean;
      second_chance_used: boolean;
      suspicion_matrix: Record<string, Record<string, number>>;
      clues: Array<{ speaker: string; quote: string; clue: string }>;
    }
  | { type: "reset" };

export type ClientMessage =
  | { type: "player_message"; content: string }
  | { type: "eject"; target: AgentName }
  | { type: "set_tts"; enabled: boolean }
  | { type: "reset" };
