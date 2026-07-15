/**
 * Types for the pi agent session JSONL format and the derived episode output.
 *
 * pi stores each session as a newline-delimited JSON stream. Each line is a
 * typed record. We only consume the record types we care about and ignore the
 * rest defensively (pi may add new record types over time).
 */

/** Top-level JSONL record discriminator. */
export type SessionRecord =
  | SessionHeader
  | ModelChange
  | ThinkingLevelChange
  | MessageRecord
  | ({ type: string } & Record<string, unknown>);

export interface SessionHeader {
  type: "session";
  version?: number;
  id: string;
  timestamp: string; // ISO 8601
  cwd: string;
}

export interface ModelChange {
  type: "model_change";
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  provider?: string;
  modelId?: string;
}

export interface ThinkingLevelChange {
  type: "thinking_level_change";
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  thinkingLevel?: string;
}

export interface MessageRecord {
  type: "message";
  id: string;
  parentId?: string | null;
  timestamp: string; // ISO 8601
  message: {
    role: "user" | "assistant" | "system" | string;
    content: ContentBlock[];
    timestamp?: number;
  };
  provider?: string;
  model?: string;
  usage?: Record<string, number>;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; thinkingSignature?: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "toolResult"; id?: string; name?: string; content?: unknown };

// ---------------------------------------------------------------------------
// Derived episode output (what the agent reasons over)
// ---------------------------------------------------------------------------

export interface EpisodeFile {
  window: { from: string; to: string; days: number };
  repo: string;
  generatedAt: string;
  sessionCount: number;
  sessions: SessionSummary[];
  aggregate: {
    totalUserTurns: number;
    totalActions: number;
    toolsUsed: Record<string, number>;
    allIntents: string[];
  };
}

export interface SessionSummary {
  id: string;
  file: string;
  cwd: string;
  startedAt: string;
  model?: string;
  thinkingLevel?: string;
  userTurnCount: number;
  messageCount: number;
  intents: string[];
  reasoning: string[];
  actions: { tool: string; summary: string }[];
  timeline: { t: string; role: "user" | "assistant"; kind: string; text: string }[];
}

export interface SessionRef {
  file: string;
  header: SessionHeader;
}
