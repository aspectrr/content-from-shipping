/**
 * cfs — content-from-shipping CLI bridge.
 *
 * Runs inside a pi terminal session. pi does the reasoning (drafting, deriving
 * voice lessons); this CLI ships the results to the web app's API. It also runs
 * the ingester to build an episode, then pushes it. Thin HTTP client only.
 *
 *   cfs episode --repo <path> [--days N] [--since ISO] [--until ISO]
 *       Run the ingester and POST the episode to the app. Prints the new id.
 *   cfs draft <file> [--episode N] [--type devlog] [--source ...] [--context ...] [--tags a,b]
 *       POST a draft. Prints the new post id.
 *   cfs final <postId> <file>
 *       POST the edited final for a post. App computes the diff.
 *   cfs lesson "<text>" [--post N] [--tags a,b]
 *       POST a voice lesson (the agent derives it from the diff).
 *   cfs episodes | cfs posts | cfs lessons
 *       List what's in the app (for the agent to read back).
 *
 * Config: CFS_URL (default http://localhost:3737).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = (process.env.CFS_URL ?? "http://localhost:3737").replace(/\/+$/, "");

function repoRoot(): string {
  // import.meta.url is <root>/cli/src/index.ts → go up two levels to the repo root.
  return process.env.CFS_ROOT ?? fileURLToPath(new URL("../../", import.meta.url));
}

function ingesterScript(): string {
  return `${repoRoot()}/ingester/src/index.ts`;
}

function die(msg: string, code = 1): never {
  console.error(`cfs: ${msg}`);
  process.exit(code);
}

function flag(arr: string[], name: string): string | undefined {
  const i = arr.indexOf(name);
  return i >= 0 ? arr[i + 1] : undefined;
}

function flagList(arr: string[], name: string): string[] | undefined {
  const v = flag(arr, name);
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
}

function readFileArg(p: string | undefined, what: string): string {
  if (!p) die(`missing <${what} file>`);
  if (p === "-") return readFileSync(0, "utf8");
  if (!existsSync(p)) die(`${what} file not found: ${p}`);
  return readFileSync(p, "utf8");
}

async function postJSON(pathname: string, body: unknown, method = "POST"): Promise<unknown> {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) die(`${method} ${pathname} → ${res.status}: ${text}`);
  return json;
}

async function getJSON(pathname: string): Promise<unknown> {
  const res = await fetch(`${BASE}${pathname}`);
  if (!res.ok) die(`GET ${pathname} → ${res.status}`);
  return res.json();
}

/** Run the ingester and return its episode JSON. */
function buildEpisode(args: string[]): string {
  const script = ingesterScript();
  if (!existsSync(script)) die(`ingester not found at ${script} (set CFS_ROOT)`);
  const ingArgs = ["run", script, "episodes", "--out", "/dev/stdout", ...args];
  const out = Bun.spawnSync({
    cmd: ["bun", ...ingArgs],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (out.exitCode !== 0) {
    die(`ingester failed: ${new TextDecoder().decode(out.stderr).trim() || "(no stderr)"}`);
  }
  return new TextDecoder().decode(out.stdout).trim();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);

  switch (cmd) {
    case "episode": {
      const repo = flag(rest, "--repo");
      if (!repo) die("--repo <path> is required");
      const ep = buildEpisode(rest.filter((a) => a !== "--out"));
      const r = (await postJSON("/api/episodes", JSON.parse(ep))) as { id: number };
      process.stdout.write(`${r.id}\n`);
      break;
    }
    case "draft": {
      const draft = readFileArg(rest[0], "draft");
      const r = (await postJSON("/api/posts", {
        draft,
        episode_id: flag(rest, "--episode") ? Number(flag(rest, "--episode")) : undefined,
        content_type: flag(rest, "--type"),
        source: flag(rest, "--source"),
        context: flag(rest, "--context"),
        tags: flagList(rest, "--tags"),
      })) as { id: number };
      process.stdout.write(`${r.id}\n`);
      break;
    }
    case "final": {
      const postId = Number(rest[0]);
      if (!Number.isFinite(postId)) die("missing <postId>");
      const final = readFileArg(rest[1], "final");
      await postJSON(`/api/posts/${postId}/final`, { final });
      process.stdout.write(`ok\n`);
      break;
    }
    case "lesson": {
      const lesson = rest[0];
      if (!lesson) die('missing "<lesson text>"');
      const postParam = flag(rest, "--post");
      const r = (await postJSON("/api/lessons", {
        lesson,
        post_id: postParam ? Number(postParam) : undefined,
        tags: flagList(rest, "--tags"),
      })) as { id: number };
      process.stdout.write(`${r.id}\n`);
      break;
    }
    case "episodes": {
      console.log(JSON.stringify(await getJSON("/api/episodes"), null, 2));
      break;
    }
    case "posts": {
      console.log(JSON.stringify(await getJSON("/api/posts"), null, 2));
      break;
    }
    case "lessons": {
      console.log(JSON.stringify(await getJSON("/api/lessons"), null, 2));
      break;
    }
    case "help":
    case "--help":
    case undefined: {
      console.log(USAGE);
      break;
    }
    default:
      die(`unknown command: ${cmd}\n\n${USAGE}`);
  }
}

const USAGE = `cfs — push content into the content-from-shipping web app

  cfs episode --repo <path> [--days N|--since ISO] [--until ISO]
      Run the ingester and POST the episode. Prints the new episode id.

  cfs draft <file|-> [--episode N] [--type devlog] [--source ...] [--context ...] [--tags a,b]
      POST a draft. Prints the new post id. Use "-" to read from stdin.

  cfs final <postId> <file|->
      POST the edited final for a post. The app computes the draft→final diff.

  cfs lesson "<text>" [--post N] [--tags a,b]
      POST a voice lesson the agent derived from a diff.

  cfs episodes | cfs posts | cfs lessons
      List what's in the app (for the agent to read back).

Config: CFS_URL (default http://localhost:3737), CFS_ROOT (repo root, default ../ of CLI).`;

await main().catch((e) => die(e instanceof Error ? e.message : String(e)));
