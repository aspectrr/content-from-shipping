/**
 * Read pi agent session JSONL files, filter by repo + time window, and parse
 * matched sessions into structured summaries. LLM-free: this only gathers and
 * shapes raw signal. The agent reasons over the output.
 */
import { openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import type {
  ContentBlock,
  MessageRecord,
  SessionHeader,
  SessionRef,
  SessionSummary,
  SessionRecord,
} from "./types.ts";

/** Resolve the pi home directory (default ~/.pi), honoring PI_HOME. */
export function piHome(): string {
  return process.env.PI_HOME ?? join(process.env.HOME ?? "~", ".pi");
}

export function sessionsDir(): string {
  return join(piHome(), "agent", "sessions");
}

/** Read only the first line of a file efficiently (headers fit in one line). */
function readFirstLine(path: string): string {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(8192);
    const n = readSync(fd, buf, 0, 8192, 0);
    const slice = buf.subarray(0, n).toString("utf8");
    const nl = slice.indexOf("\n");
    return nl === -1 ? slice : slice.slice(0, nl);
  } finally {
    closeSync(fd);
  }
}

function parseHeader(file: string): SessionHeader | null {
  const line = readFirstLine(file).trim();
  if (!line) return null;
  try {
    const rec = JSON.parse(line) as SessionRecord;
    if (rec && typeof rec === "object" && rec.type === "session") {
      return rec as SessionHeader;
    }
  } catch {
    /* malformed first line — skip */
  }
  return null;
}

/** Glob every session JSONL under the sessions root. */
async function listAllSessionFiles(): Promise<string[]> {
  const root = sessionsDir();
  const glob = new Bun.Glob("**/*.jsonl");
  const out: string[] = [];
  for await (const rel of glob.scan({ cwd: root, absolute: true })) {
    out.push(rel);
  }
  return out;
}

export interface WindowFilter {
  from: Date;
  to: Date;
  days: number;
}

export function computeWindow(opts: {
  days?: number;
  since?: string;
  until?: string;
}): WindowFilter {
  const to = opts.until ? new Date(opts.until) : new Date();
  let from: Date;
  let days: number;
  if (opts.since) {
    from = new Date(opts.since);
    days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  } else {
    days = opts.days ?? 7;
    from = new Date(to.getTime() - days * 86_400_000);
  }
  return { from, to, days };
}

function normalize(p: string): string {
  return p.replace(/\/+$/, "");
}

/** Does this session cwd belong to the requested repo? */
function repoMatches(sessionCwd: string, repo: string): boolean {
  const c = normalize(sessionCwd);
  const r = normalize(repo);
  if (!r) return true;
  if (c === r) return true;
  if (c.startsWith(r + "/")) return true;
  // basename fallback: repo given as a bare name like "fine-tune-agent-data"
  const baseR = r.split("/").pop()!;
  if (baseR === r && c.split("/").pop() === baseR) return true;
  if (c.split("/").pop() === baseR && baseR.length > 2) return true;
  return false;
}

/** Find session files whose repo + timestamp match the filter. */
export async function findSessions(
  repo: string,
  win: WindowFilter,
): Promise<SessionRef[]> {
  const files = await listAllSessionFiles();
  const refs: SessionRef[] = [];
  for (const file of files) {
    const header = parseHeader(file);
    if (!header) continue;
    if (repo && !repoMatches(header.cwd, repo)) continue;
    const ts = new Date(header.timestamp);
    if (ts < win.from || ts > win.to) continue;
    refs.push({ file, header });
  }
  // newest first
  refs.sort((a, b) => b.header.timestamp.localeCompare(a.header.timestamp));
  return refs;
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n) + "…" : flat;
}

/** Build a one-line summary for a tool call from its args. */
function summarizeAction(args: Record<string, unknown>): string {
  const cmd = args.command ?? args.pattern ?? args.path;
  if (typeof cmd === "string") {
    const firstLine = cmd.split("\n")[0] ?? "";
    return truncate(firstLine, 140);
  }
  if (args.url && typeof args.url === "string") return truncate(args.url, 140);
  const json = JSON.stringify(args);
  return truncate(json, 140);
}

const REASONING_CAP = 8;
const TIMELINE_CAP = 60;

/** Fully parse one session file into a summary the agent can read. */
export async function parseSession(file: string): Promise<SessionSummary> {
  const text = await Bun.file(file).text();
  const lines = text.split("\n");

  let header: SessionHeader | null = null;
  let model: string | undefined;
  let thinkingLevel: string | undefined;
  const intents: string[] = [];
  const reasoning: string[] = [];
  const actions: { tool: string; summary: string }[] = [];
  const timeline: SessionSummary["timeline"] = [];
  let userTurnCount = 0;
  let messageCount = 0;
  let skippedReasoning = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: SessionRecord;
    try {
      rec = JSON.parse(trimmed) as SessionRecord;
    } catch {
      continue;
    }
    if (!rec || typeof rec !== "object") continue;

    switch (rec.type) {
      case "session":
        header = rec as SessionHeader;
        break;
      case "model_change":
        if ((rec as { modelId?: string }).modelId) model = (rec as { modelId?: string }).modelId;
        break;
      case "thinking_level_change":
        thinkingLevel = (rec as { thinkingLevel?: string }).thinkingLevel;
        break;
      case "message": {
        messageCount++;
        const m = rec as MessageRecord;
        const role = m.message?.role;
        const blocks: ContentBlock[] = Array.isArray(m.message?.content) ? m.message.content : [];
        if (role === "user") {
          const userText = blocks
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join(" ")
            .trim();
          if (userText) {
            userTurnCount++;
            intents.push(truncate(userText, 320));
            if (timeline.length < TIMELINE_CAP) {
              timeline.push({ t: m.timestamp, role: "user", kind: "intent", text: truncate(userText, 200) });
            }
          }
        } else if (role === "assistant") {
          for (const b of blocks) {
            if (b.type === "thinking" && b.thinking) {
              if (reasoning.length < REASONING_CAP) {
                reasoning.push(truncate(b.thinking, 280));
              } else {
                skippedReasoning++;
              }
            } else if (b.type === "toolCall") {
              const summary = summarizeAction(b.arguments ?? {});
              actions.push({ tool: b.name, summary });
              if (timeline.length < TIMELINE_CAP) {
                timeline.push({
                  t: m.timestamp,
                  role: "assistant",
                  kind: "action",
                  text: `${b.name}: ${summary}`,
                });
              }
            } else if (b.type === "text" && b.text.trim()) {
              if (timeline.length < TIMELINE_CAP) {
                timeline.push({ t: m.timestamp, role: "assistant", kind: "text", text: truncate(b.text, 200) });
              }
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  if (skippedReasoning > 0) {
    reasoning.push(`_(+${skippedReasoning} more reasoning blocks not shown — open the raw file for full trace)_`);
  }

  return {
    id: header?.id ?? "(unknown)",
    file,
    cwd: header?.cwd ?? "(unknown)",
    startedAt: header?.timestamp ?? "(unknown)",
    model,
    thinkingLevel,
    userTurnCount,
    messageCount,
    intents,
    reasoning,
    actions,
    timeline,
  };
}
