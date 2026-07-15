#!/usr/bin/env bun
/**
 * content-from-shipping ingester
 *
 * Turns pi agent sessions into structured "episodes" for content generation.
 * LLM-free: gathers and correlates raw signal only. The agent reasons over
 * the emitted JSON (see the content-from-shipping skill).
 *
 * Usage:
 *   bun run src/index.ts episodes --repo /path/to/repo [--days 7] [--since ISO] [--until ISO]
 *   bun run src/index.ts episodes --repo /path/to/repo --out episode.json
 *   bun run src/index.ts repos            # list repos seen in recent sessions
 */
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { computeWindow, findSessions, parseSession, sessionsDir } from "./sessions.ts";
import type { EpisodeFile } from "./types.ts";

interface Args {
  command: string;
  repo?: string;
  days?: number;
  since?: string;
  until?: string;
  out?: string;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  const args: Args = { command: command ?? "help" };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = rest[i + 1];
    switch (a) {
      case "--repo":
        args.repo = next;
        i++;
        break;
      case "--days":
        args.days = Number(next);
        i++;
        break;
      case "--since":
        args.since = next;
        i++;
        break;
      case "--until":
        args.until = next;
        i++;
        break;
      case "--out":
        args.out = next;
        i++;
        break;
      case "--limit":
        args.limit = Number(next);
        i++;
        break;
      case "-h":
      case "--help":
        args.command = "help";
        break;
      default:
        if (a?.startsWith("--")) {
          console.error(`unknown flag: ${a}`);
          process.exit(2);
        }
    }
  }
  return args;
}

function usage(): string {
  return `
content-from-shipping ingester — turn pi sessions into content episodes

  episodes --repo <path> [--days N|--since ISO] [--until ISO] [--out FILE] [--limit N]
      Parse sessions for a repo within a window into one episode JSON.
      --repo   repo path (or bare name) to match session cwds against
      --days   lookback in days (default 7)
      --since  ISO start (overrides --days)
      --until  ISO end (default now)
      --out    write JSON to FILE instead of stdout
      --limit  cap number of sessions parsed (default 50)

  repos [--days N]
      List distinct repo cwds seen in recent sessions (helps pick --repo).

  help
      This message.
`.trim();
}

async function cmdEpisodes(args: Args): Promise<void> {
  if (!args.repo) {
    console.error("error: --repo is required (run `repos` to discover one)");
    process.exit(2);
  }
  const win = computeWindow({ days: args.days, since: args.since, until: args.until });
  const refs = await findSessions(args.repo, win);
  const limit = args.limit ?? 50;
  const picked = refs.slice(0, limit);

  const sessions = [];
  for (const ref of picked) {
    sessions.push(await parseSession(ref.file));
  }

  const toolsUsed: Record<string, number> = {};
  let totalUserTurns = 0;
  let totalActions = 0;
  const allIntents: string[] = [];
  for (const s of sessions) {
    totalUserTurns += s.userTurnCount;
    totalActions += s.actions.length;
    for (const a of s.actions) toolsUsed[a.tool] = (toolsUsed[a.tool] ?? 0) + 1;
    allIntents.push(...s.intents);
  }

  const episode: EpisodeFile = {
    window: { from: win.from.toISOString(), to: win.to.toISOString(), days: win.days },
    repo: args.repo,
    generatedAt: new Date().toISOString(),
    sessionCount: refs.length,
    sessions,
    aggregate: { totalUserTurns, totalActions, toolsUsed, allIntents },
  };

  const json = JSON.stringify(episode, null, 2);
  if (args.out) {
    writeFileSync(args.out, json);
    console.error(
      `wrote ${args.out}: ${sessions.length} session(s) parsed of ${refs.length} matched ` +
        `(${refs.length > picked.length ? `${refs.length - picked.length} capped by --limit, ` : ""}window ${win.days}d)`,
    );
  } else {
    console.log(json);
  }
}

async function cmdRepos(args: Args): Promise<void> {
  const win = computeWindow({ days: args.days ?? 30, since: args.since, until: args.until });
  const refs = await findSessions("", win); // repo="" matches all
  const counts = new Map<string, number>();
  for (const r of refs) {
    counts.set(r.header.cwd, (counts.get(r.header.cwd) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    console.error(`no sessions found in the last ${win.days} days under ${sessionsDir()}`);
    return;
  }
  for (const [cwd, n] of rows) {
    console.log(`${String(n).padStart(3)}  ${cwd}  (${basename(cwd)})`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "episodes":
      await cmdEpisodes(args);
      break;
    case "repos":
      await cmdRepos(args);
      break;
    case "help":
    case "--help":
    case "":
      console.log(usage());
      break;
    default:
      console.error(`unknown command: ${args.command}\n\n${usage()}`);
      process.exit(2);
  }
}

await main();
