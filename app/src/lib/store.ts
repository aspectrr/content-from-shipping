/**
 * SQLite store for the content app. Single source of truth for episodes,
 * posts (draft → final → diff), and voice lessons. Fed by the `cfs` CLI;
 * read by the UI.
 *
 * Uses node:sqlite (built into Node 22+, unflagged in 24) — no native deps,
 * works under both Node and Bun runtimes.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.CFS_DB
  ? process.env.CFS_DB
  : path.join(process.cwd(), "..", "data", "content.db");

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const conn = new DatabaseSync(DB_PATH);
  conn.exec(SCHEMA);
  _db = conn;
  return conn;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS episodes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo        TEXT NOT NULL,
  window      TEXT,
  summary     TEXT,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id    INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  content_type  TEXT,
  source        TEXT,
  context       TEXT,
  tags          TEXT,
  draft         TEXT NOT NULL,
  final         TEXT,
  diff          TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lessons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  lesson      TEXT NOT NULL,
  tags        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_episode ON posts(episode_id);
CREATE INDEX IF NOT EXISTS idx_lessons_post ON lessons(post_id);
`;

function now(): string {
  return new Date().toISOString();
}

function tagsToJSON(tags: string[] | undefined): string {
  return JSON.stringify(tags ?? []);
}

function parseTags(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- episodes

export interface EpisodeRecord {
  id: number;
  repo: string;
  window: string | null;
  summary: string | null;
  payload: unknown;
  created_at: string;
}

export function insertEpisode(input: {
  repo: string;
  window?: string;
  summary?: string;
  payload: unknown;
}): number {
  const stmt = db().prepare(
    "INSERT INTO episodes (repo, window, summary, payload, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const res = stmt.run(input.repo, input.window ?? null, input.summary ?? null, JSON.stringify(input.payload), now());
  return Number(res.lastInsertRowid);
}

export function listEpisodes(limit = 50): EpisodeRecord[] {
  const rows = db()
    .prepare("SELECT id, repo, window, summary, payload, created_at FROM episodes ORDER BY id DESC LIMIT ?")
    .all(limit) as (Omit<EpisodeRecord, "payload"> & { payload: string })[];
  return rows.map((r) => ({ ...r, payload: safeParse(r.payload) }));
}

export function getEpisode(id: number): EpisodeRecord | null {
  const r = db()
    .prepare("SELECT id, repo, window, summary, payload, created_at FROM episodes WHERE id = ?")
    .get(id) as (Omit<EpisodeRecord, "payload"> & { payload: string }) | undefined;
  return r ? { ...r, payload: safeParse(r.payload) } : null;
}

// ----------------------------------------------------------------- posts

export interface PostRecord {
  id: number;
  episode_id: number | null;
  content_type: string | null;
  source: string | null;
  context: string | null;
  tags: string[];
  draft: string;
  final: string | null;
  diff: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToPost(r: Record<string, unknown>): PostRecord {
  return {
    id: Number(r.id),
    episode_id: r.episode_id == null ? null : Number(r.episode_id),
    content_type: (r.content_type as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    context: (r.context as string | null) ?? null,
    tags: parseTags((r.tags as string | null) ?? null),
    draft: r.draft as string,
    final: (r.final as string | null) ?? null,
    diff: (r.diff as string | null) ?? null,
    status: r.status as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

const POST_COLS =
  "id, episode_id, content_type, source, context, tags, draft, final, diff, status, created_at, updated_at";

export function insertPost(input: {
  episode_id?: number;
  content_type?: string;
  source?: string;
  context?: string;
  tags?: string[];
  draft: string;
}): number {
  const ts = now();
  const res = db()
    .prepare(
      `INSERT INTO posts (episode_id, content_type, source, context, tags, draft, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    )
    .run(
      input.episode_id ?? null,
      input.content_type ?? null,
      input.source ?? null,
      input.context ?? null,
      tagsToJSON(input.tags),
      input.draft,
      ts,
      ts,
    );
  return Number(res.lastInsertRowid);
}

export function listPosts(limit = 100): PostRecord[] {
  const rows = db().prepare(`SELECT ${POST_COLS} FROM posts ORDER BY id DESC LIMIT ?`).all(limit) as Record<
    string,
    unknown
  >[];
  return rows.map(rowToPost);
}

export function getPost(id: number): PostRecord | null {
  const r = db().prepare(`SELECT ${POST_COLS} FROM posts WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? rowToPost(r) : null;
}

export function setFinal(id: number, final: string): PostRecord | null {
  const diff = computeDiff(getPost(id)?.draft ?? "", final);
  db()
    .prepare("UPDATE posts SET final = ?, diff = ?, status = 'finalized', updated_at = ? WHERE id = ?")
    .run(final, diff, now(), id);
  return getPost(id);
}

export function updateDraft(id: number, draft: string): PostRecord | null {
  db().prepare("UPDATE posts SET draft = ?, updated_at = ? WHERE id = ?").run(draft, now(), id);
  return getPost(id);
}

// --------------------------------------------------------------- lessons

export interface LessonRecord {
  id: number;
  post_id: number | null;
  lesson: string;
  tags: string[];
  created_at: string;
}

export function insertLesson(input: { post_id?: number; lesson: string; tags?: string[] }): number {
  const res = db()
    .prepare("INSERT INTO lessons (post_id, lesson, tags, created_at) VALUES (?, ?, ?, ?)")
    .run(input.post_id ?? null, input.lesson, tagsToJSON(input.tags), now());
  return Number(res.lastInsertRowid);
}

export function listLessons(limit = 200): LessonRecord[] {
  const rows = db()
    .prepare("SELECT id, post_id, lesson, tags, created_at FROM lessons ORDER BY id DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToLesson);
}

function rowToLesson(r: Record<string, unknown>): LessonRecord {
  return {
    id: Number(r.id),
    post_id: r.post_id == null ? null : Number(r.post_id),
    lesson: r.lesson as string,
    tags: parseTags((r.tags as string | null) ?? null),
    created_at: r.created_at as string,
  };
}

export function lessonsForPost(postId: number): LessonRecord[] {
  const rows = db()
    .prepare("SELECT id, post_id, lesson, tags, created_at FROM lessons WHERE post_id = ? ORDER BY id ASC")
    .all(postId) as Record<string, unknown>[];
  return rows.map(rowToLesson);
}

// ----------------------------------------------------------------- utils

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Line-based unified diff (compact LCS). Empty string if draft == final. */
export function computeDiff(draft: string, final: string): string {
  if (draft === final) return "";
  const a = draft.split("\n");
  const b = final.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(" " + a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push("-" + a[i]);
      i++;
    } else {
      out.push("+" + b[j]);
      j++;
    }
  }
  while (i < n) out.push("-" + a[i++]);
  while (j < m) out.push("+" + b[j++]);
  return out.join("\n");
}
