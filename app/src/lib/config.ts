import path from "node:path";
import fs from "node:fs";

/**
 * Paths to the sibling components of this app (the ingester + content-learn CLI).
 *
 * In `next dev`, process.cwd() is the app directory, so the repo root is its
 * parent. Override with CFS_ROOT for any other layout.
 */
function resolveRoot(): string {
  if (process.env.CFS_ROOT && process.env.CFS_ROOT.length > 0) return process.env.CFS_ROOT;
  return path.resolve(process.cwd(), "..");
}

export const REPO_ROOT = resolveRoot();
export const INGESTER_SCRIPT = path.join(REPO_ROOT, "ingester", "src", "index.ts");

const BUILT_BINARY = path.join(REPO_ROOT, "voice", "target", "release", "content-learn");

/** Prefer the built release binary; fall back to PATH (cargo install). */
export function contentLearnBin(): string {
  return fs.existsSync(BUILT_BINARY) ? BUILT_BINARY : "content-learn";
}

/** Path to the content-from-shipping skill (for reference / future explicit loading). */
export const SKILL_PATH = path.join(REPO_ROOT, "skills", "content-from-shipping", "SKILL.md");
