import { AgentName } from "../types";

export const EJECT_MIN = 2;

export const PROMPTS_BY_TENSION: Record<number, [string, ...string[]]> = {
  0: [
    "Give me your alibi again. Include a verifiable detail.",
    "Where were you in the 10 minutes before Sarah died?",
  ],
  1: ["Could someone vouch for Flint's alibi?", "Who has the most to gain from Sarah being gone?"],
  2: [
    "Daisy: take a deep breath. What is your gut telling you?",
    "Nova: separate facts from guesses. What do we actually know?",
  ],
  3: [
    "Time's running out. Call out one inconsistency you heard.",
    "Flint, you seem to know something the rest of us don't.",
  ],
  4: [
    "Final chance: name your suspect and your strongest reason.",
    "Last question. What single detail should I not ignore?",
  ],
};

export const DEFAULT_TYPING_STATE: Record<AgentName, boolean> = {
  daisy: false,
  nova: false,
  flint: false,
};
