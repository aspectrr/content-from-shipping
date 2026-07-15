---
name: content-from-shipping
description: >-
  Turn pi agent sessions into content — devlogs, changelogs, social posts — in the
  user's voice, and learn from every edit. The agent (in the terminal) does all
  the reasoning; the `cfs` CLI pushes results into a web app that stores drafts,
  computes draft→final diffs, and accumulates voice lessons. Activate when the
  user wants to write about work they shipped, draft a devlog from recent
  activity, push content to the app, or learn voice from edits.
---

# content-from-shipping

Turn shipping into content in the user's voice. **You (the agent) do all the reasoning** — picking what's worth writing, drafting it, and deriving voice lessons from the user's edits. The `cfs` CLI just ships your output to the web app; the app just stores and diffs. No reasoning happens in the app or the CLI.

## The shape

```
  pi (terminal, you)              cfs CLI (dumb pipe)            web app (store + diff + UI)
  ─────────────────               ──────────────────             ──────────────────────────
  cfs episode  ─── build episode ──► POST /api/episodes   ──►  episodes table
  cfs lessons  ◄── read back ───────────────────────────────    │
  draft        ─── cfs draft ────► POST /api/posts       ──►  posts (status=draft)
  user edits   (in the web UI at /posts/<id>, or you rewrite)
  cfs final    ─── push final ───► POST /api/posts/:id/final ►  computes diff, status=finalized
  cfs posts    ◄── read diff ───────────────────────────────    │
  derive lessons (you)
  cfs lesson   ─── push lessons ─► POST /api/lessons     ──►  lessons table
```

The web app runs at `http://localhost:3737` (override with `CFS_URL`). Start it with `bun run dev` in `app/`. The CLI is `bun run <repo>/cli/src/index.ts` — alias it to `cfs` for brevity, e.g. `alias cfs='bun run ~/GitHub/content-from-shipping/cli/src/index.ts'`.

## Commands you use

```bash
cfs episode --repo <path> [--days N|--since ISO] [--until ISO]   # build + push episode → prints id
cfs draft <file|-> [--episode N] [--type devlog] [--source ...] [--context ...] [--tags a,b]  # → post id
cfs final <postId> <file|->                                       # push final → app computes diff
cfs lesson "<lesson>" [--post N] [--tags a,b]                     # store a voice lesson
cfs episodes | cfs posts | cfs lessons                            # read back (JSON)
```

## Workflow A — draft a new piece

1. **Find recent work** — pick the repo the user names (or the busiest). Build an episode:
   ```bash
   cfs episode --repo /path/to/repo --days 7
   ```
   Note the printed episode id. Read the episode in the web app (`/episodes/<id>`) or via `cfs episodes`.
2. **Calibrate voice before writing** — read the accumulated lessons:
   ```bash
   cfs lessons
   ```
   These are the rules. If there are none yet (cold start), draft to your best general standard and let the loop teach you from the first edit.
3. **Pick the highest-signal session.** Not every session is a post. Worth writing when there's: a clear stated intent, an interesting journey (a decision, a course correction, a dead end), and a tangible outcome. The episode's **reasoning traces are the gold** for narrative — that's the "why" and "what was hard."
4. **Draft** in the requested format (default devlog) applying every applicable lesson. Write it to a file.
5. **Push the draft:**
   ```bash
   cfs draft post.md --episode <episodeId> --type devlog --source "repo:7d" --context "<one line>"
   ```
   Note the post id. Tell the user: **open `http://localhost:3737/posts/<postId>` to edit.**

## Workflow B — learn from an edit (the closed loop)

This is where voice compounds. The user edits your draft. Two ways that happens:

- **They edited in the web UI:** they opened `/posts/<id>`, changed the text, clicked "save as final." The app already computed the diff. Skip to step 2.
- **They gave you the edited version** (or asked you to revise): write the final to a file and push it:
  ```bash
  cfs final <postId> final.md
  ```
  The app computes the draft→final diff and marks it finalized.

Then:

2. **Read the diff:**
   ```bash
   cfs posts          # find the post, read its `diff` field
   ```
3. **Derive 1–3 specific voice lessons** from the diff (see *What counts as a good lesson*).
4. **Push each:**
   ```bash
   cfs lesson "Open with the tension, not 'This week I…'." --post <postId> --tags devlog,structure
   ```

Only store **voice** lessons — how Collin writes — not content lessons (what he chose to write about).

## What counts as a good lesson

Specific, actionable, voice-coded. Names a swap or structural move you can repeat; about *how Collin writes*, not correctness.

Good:
- "Open devlogs with the question or tension, not a week-in-review."
- "Cut hedging: 'I think we should' → 'We should.'"
- "Never end a section with a significance summary."

Bad (reject):
- "Be clear and engaging." (generic)
- "Mention the repo name." (content, not voice)

**Negative lessons are gold** — things Collin never does. Capture them. Don't over-fit: a swap seen once is a candidate (`--tags unconfirmed`); promote only after 2–3 sightings.

## Format guidance

- **Devlog** — narrative. Hook (the question/tension) → journey (decisions, one wrong turn) → outcome. First person, direct. Uses reasoning traces heavily.
- **Changelog** — terse, user-facing. Grouped bullets, what changed for the user. No journey.
- **Social** — one idea, punchy. A single insight distilled, not a recap.

Default to devlog when unspecified.

## Failure modes

- **Treating the episode as a summary.** You decide what's worth a post; most sessions aren't.
- **Ignoring reasoning traces.** The `reasoning` array is what makes narrative possible — use it.
- **Storing content lessons as voice lessons.** Voice = how, not what.
- **Over-fitting to one edit.** Confirm across posts before promoting.
- **Generic lessons.** If you can't say *what specifically changed*, don't store a lesson.

## Next phase

git commits and Linear tickets (via `orca linear`) join the episode builder, so an episode carries the plan (ticket), the journey (sessions), and the delivery (commits). The `cfs episode` command and the web app's episode view already anticipate them.
