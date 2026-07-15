# content-from-shipping

Turn your shipping — pi agent sessions (and soon git + Linear) — into content (devlogs, changelogs, social posts) that sounds like you, and gets better every time you edit a draft.

Inspired by [Notra](https://github.com/usenotra/notra) (the pipeline idea, not the code). Built on the [email-for-agents](https://github.com/collinpfeifer/email-for-agents) principle: **the agent does all the reasoning; the dumb tools just store and retrieve.**

## How it works

```
  pi (terminal, the brain)        cfs CLI (dumb pipe)          web app (store + diff + UI)
  ──────────────────────          ──────────────────           ──────────────────────────
  build episode ─┐                episode/draft/final/lesson   SQLite (episodes, posts,
  draft content  ├──►  cfs  ──────────────────────────────►    lessons). computes the
  you edit       ┤                                              draft→final diff.
  derive lessons ┘            ◄── cfs posts/lessons (read)      Next.js + Tailwind dashboard
```

- **pi** stays in the terminal: it picks what's worth writing, drafts it, and derives voice lessons from your edits. No model code lives in the app.
- **`cfs`** is a thin HTTP client that pushes episodes/drafts/finals/lessons to the web app's API.
- **The web app** is the single source of truth: it stores content, computes draft→final diffs, and shows everything in a dashboard with an editor.

The loop: pi drafts from an episode → you edit in the web UI → the app diffs it → pi reads the diff, derives voice lessons, pushes them → next draft applies those lessons. Voice compounds from edits. (No seed corpus — it learns purely from diffs going forward.)

## Repo layout

```
app/        Next.js (run on Bun) + Tailwind — the dashboard + API + SQLite store
cli/        cfs — the CLI bridge pi calls to push content to the app
ingester/   episode builder (Bun/TS) — parses pi sessions into structured episodes
skills/     content-from-shipping/SKILL.md — the skill that orchestrates the loop in pi
voice/      content-learn — the original standalone Rust voice-store CLI (legacy;
            the web app is now the store, but this is kept for reference/offline use)
scripts/    helpers
```

## Install

```bash
# 1. Web app + ingester + CLI deps
cd app && bun install && cd ..
cd cli && bun install && cd ..
cd ingester && bun install

# 2. Run the web app
cd app && bun run dev      # → http://localhost:3737

# 3. (optional) alias the CLI so pi calls it as `cfs`
alias cfs='bun run ~/GitHub/content-from-shipping/cli/src/index.ts'
```

## The CLI (`cfs`)

```bash
cfs episode --repo <path> [--days N|--since ISO] [--until ISO]   # build + push episode
cfs draft <file|-> [--episode N] [--type devlog] [--source ...] [--context ...] [--tags a,b]
cfs final <postId> <file|->                                       # push final → app computes diff
cfs lesson "<lesson>" [--post N] [--tags a,b]                     # store a voice lesson
cfs episodes | cfs posts | cfs lessons                            # read back
```

Config: `CFS_URL` (default `http://localhost:3737`), `CFS_ROOT` (repo root).

## The loop, end to end

In a pi session (skill `content-from-shipping`):

1. `cfs episode --repo /path/to/repo --days 7` → pi reads the episode, drafts a post.
2. `cfs draft post.md --episode <id> --type devlog` → draft appears in the web app.
3. You open `/posts/<id>` in the app, edit, click **save as final**. The app computes the diff.
4. `cfs posts` → pi reads the diff, derives 1–3 voice lessons, pushes each with `cfs lesson`.
5. Next time, pi reads `cfs lessons` first and writes to them.

See `skills/content-from-shipping/SKILL.md` for the full workflow and what counts as a good lesson.

## Data

- **App DB**: `data/content.db` (override `CFS_DB=/path.db`).
- **pi sessions** (ingester source): `~/.pi/agent/sessions/` (override `PI_HOME`).

## License

MIT
