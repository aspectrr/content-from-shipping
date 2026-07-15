#!/usr/bin/env bun
/**
 * List posts in the blog corpus for baseline voice seeding.
 * Prints path, char count, and frontmatter title so you (or the agent) can
 * pick substantive posts and skip stubs. Pair with Workflow C in the skill:
 *
 *   content-learn add "<post>" --content-type essay --source "blog:<slug>" --tags baseline,essay
 */
import { join } from "node:path";

const blogDir = process.env.BLOG_DIR ?? join(process.env.HOME ?? "~", "GitHub/collinpfeifer.dev/src/content/blog");
const minChars = Number(process.env.MIN_CHARS ?? "500");

const glob = new Bun.Glob("**/*.{md,mdx}");
const files: string[] = [];
for await (const rel of glob.scan({ cwd: blogDir, absolute: true })) {
  files.push(rel);
}
files.sort();

if (files.length === 0) {
  console.error(`no posts found under ${blogDir}`);
  console.error("set BLOG_DIR to point at your content collection");
  process.exit(1);
}

const rows: { path: string; chars: number; title: string }[] = [];
for (const f of files) {
  const text = await Bun.file(f).text();
  const titleMatch = text.match(/^title:\s*"?(.+?)"?\s*$/m);
  rows.push({ path: f, chars: text.length, title: titleMatch?.[1] ?? "(untitled)" });
}

const keep = rows.filter((r) => r.chars >= minChars);
const skip = rows.filter((r) => r.chars < minChars);

console.log(`# ${keep.length} substantive posts (>= ${minChars} chars) under ${blogDir}\n`);
for (const r of keep) {
  console.log(`${String(r.chars).padStart(6)}  ${r.title}`);
  console.log(`         ${r.path}`);
}
if (skip.length) {
  console.log(`\n# ${skip.length} stubs skipped (< ${minChars} chars): ${skip.map((s) => s.path.split("/").pop()).join(", ")}`);
}
