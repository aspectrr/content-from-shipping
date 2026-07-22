---
name: content-from-shipping
description: >-
  Turn pi agent sessions into content — devlogs, changelogs, social posts — in the
  user's voice, and learn voice from every edit. Pulls conversation history from
  session files, drafts into redline (the local revision-pair + voice-pattern
  library), and learns from the user's edits. Activate when the user wants to
  write about work they shipped, pull conversation history from recent sessions,
  or draft a devlog from recent activity.
---

# content-from-shipping

Turn shipping into content in the user's voice. This skill does one half: **pulls session history and decides what's worth writing.** The other half — storing drafts, computing diffs, linting against voice patterns, accumulating lessons — is **redline's job.** Drafts you push land in the redline app for the user to edit.

## Two tools, one loop

```
  ~/.pi/agent/sessions/*.jsonl     redline (CLI / MCP / Tauri app, one SQLite DB)
  ────────────────────────         ─────────────────────────────────────────────
  YOU read sessions directly       redline draft    → draft in the app's inbox
  pick what's worth a post         redline lessons  → calibrate voice before writing
  draft into redline ───────────►  redline lint     → auto-checks against patterns
                                   (user edits in the redline app)
                                   redline finalize → computes draft→final diff
                                   redline analyze  → what changed (deletions, swaps)
                                   redline add-lesson + add-pattern → learn
```

redline is already installed (`redline` on PATH, DB at `~/.redline/emails.db`). If the `redline` MCP server is connected in this session, prefer its tools (`create_draft`, `list_lessons`, `finalize_draft`, `analyze_diff`, `add_lesson`, `add_pattern`) over shelling out — same data, no subprocess per call. Either surface works.

## Pull conversation history

pi stores every session as a JSONL file — one typed record per line. Sessions are grouped into directories named after the working directory, with `/` replaced by `-`. So sessions for a repo are found by **globbing the repo's basename** in the path.

**List recent sessions for a repo** (newest first, last N days):

```bash
find ~/.pi/agent/sessions -path '*content-from-shipping*' -name '*.jsonl' -mtime -7 | sort -r
```

`sort -r` works because filenames begin with an ISO timestamp (`2026-07-21T14-10-17-…_<id>.jsonl`), so lexical order is chronological. Replace `content-from-shipping` with the repo basename the user names. Drop `-path` to search all repos.

**Scan headers** to see cwd + when (without loading whole files):

```bash
for f in $(find ~/.pi/agent/sessions -path '*<basename>*' -name '*.jsonl' -mtime -7 | sort -r); do
  echo "=== $f ==="; head -1 "$f" | jq -rc '{cwd, timestamp, id}'
done
```

### Session format

Each line is one record. The types that matter:

- `{"type":"session","cwd":"…","timestamp":"…","id":"…"}` — the header, always first.
- `{"type":"model_change", …}` / `{"type":"thinking_level_change", …}` — metadata.
- `{"type":"message","timestamp":"…","message":{"role":"user|assistant","content":[ …blocks ]}}` — the conversation.

Content blocks inside a message:

- `{"type":"text","text":"…"}` — visible text (user's intent, or agent's reply).
- `{"type":"thinking","thinking":"…"}` — **the reasoning trace. This is the gold for narrative** — the "why," the deliberation, the course corrections.
- `{"type":"toolCall","name":"…","arguments":{…}}` — what the agent did.
- `{"type":"toolResult", …}` — tool output.

**Extract the signal from one session** (intents, reasoning, actions — one line each):

```bash
jq -rc 'select(.type=="message") | .message.content[]? |
  if .type=="text"     then "TEXT:  " + (.text | gsub("\n";" "))
  elif .type=="thinking" then "THINK: " + (.thinking | gsub("\n";" "))
  elif .type=="toolCall" then "CALL:  " + .name + " " + (.arguments | tostring)
  else empty end' <session.jsonl>
```

For the full, unabridged record, just `read` the file directly. Use the jq extract to triage many sessions fast, then `read` the one or two worth writing about.

## Workflow A — draft a new piece

1. **Find recent work.** Ask which repo (or take the busiest). List its recent sessions (above). Scan headers + intents to see what happened.
2. **Calibrate voice before writing.** Read the accumulated lessons and patterns:
   ```bash
   redline lessons                    # voice rules derived from past edits
   redline list-patterns              # matchable patterns the lint engine enforces
   ```
   These are your constraints. On cold start (empty), draft to your best general standard; the loop teaches you from the first edit.
3. **Pick the highest-signal session.** Not every session is a post. Worth writing when there's: a clear stated intent, an interesting journey (a decision, a course correction, a dead end), and a tangible outcome. **The `thinking` blocks are the gold** — that's the "why" and "what was hard." Most sessions aren't a post; you decide.
4. **Draft** in the requested format (see *Content formats*), applying every applicable lesson and avoiding every pattern. Write to a temp file.
5. **Push the draft to redline:**
   ```bash
   redline draft post.md --context "devlog: <repo>, last 7d" --tags devlog,content
   ```
   This prints the **draft id** plus all **stored voice patterns** and any **lint violations** — it auto-lints on creation. If there are violations, rewrite the file to fix them, then delete + re-push (`redline delete-draft <id>`; `redline draft …`). Repeat until clean.
6. **Hand off.** Tell the user the draft is in the redline app's Drafts inbox — they edit it there. Note the draft id so you can finalize later.

## Workflow B — learn from an edit (the closed loop)

The user edited your draft in the redline app. Now voice compounds.

1. **Finalize** (the user tells you they're done, or you check `redline drafts` for status):
   ```bash
   redline finalize <draft_id>
   ```
   Prints the **pair id** plus **diff analysis** (deletions, additions, word swaps, categorized changes, existing-pattern hits) and any **auto-promoted patterns**. For a deeper dive: `redline analyze <pair_id>`.
2. **Derive 1–3 voice lessons** from the analysis. **Deletions are the strongest signal** — what got cut entirely is what the user's voice rejects. Word swaps show specific before→after preferences. See *What counts as a good lesson*.
3. **Store each lesson + a matchable pattern:**
   ```bash
   redline add-lesson <pair_id> "Open devlogs with the tension, not 'This week I…'." --tags devlog,content
   redline add-pattern --rule "Don't open with week-in-review framing" --pattern "This week I" --category style
   ```
   **Always create a pattern alongside a lesson.** Lessons without patterns don't lint — future drafts won't catch the issue. Patterns auto-promote from `unconfirmed` → `confirmed` after appearing in 3+ pairs' drafts (runs automatically on `finalize`).

## Content formats

- **Devlog** — narrative. Hook (the question/tension) → journey (decisions, one wrong turn) → outcome. First person, direct. Uses reasoning traces heavily.
- **Changelog** — terse, user-facing. Grouped bullets, what changed for the user. No journey.
- **Social** — one idea, punchy. A single insight distilled, not a recap.

Default to devlog when unspecified. Tags: `devlog`, `changelog`, `social`, always with `content` so they're distinguishable from email pairs in the shared DB.

## What counts as a good lesson

Specific, actionable, voice-coded. Names a swap or structural move you can repeat; about *how the user writes*, not correctness.

Good:
- "Open devlogs with the question or tension, not a week-in-review."
- "Cut hedging: 'I think we should' → 'We should.'"
- "Never end a section with a significance summary."

Bad (reject):
- "Be clear and engaging." (generic)
- "Mention the repo name." (content, not voice)

**Negative lessons are gold** — things the user never does. Capture them. Don't over-fit: one sighting is a candidate (pattern starts `unconfirmed`); it auto-promotes after 3+ sightings.

## redline command reference

| CLI | MCP tool | Purpose |
|---|---|---|
| `redline draft <file> --context --tags` | `create_draft` | Push draft; returns id + patterns + lint violations |
| `redline lessons [--tags]` | `list_lessons` | Read voice lessons (calibrate before writing) |
| `redline list-patterns` | `list_patterns` | Matchable patterns the lint engine enforces |
| `redline lint <draft_id>` / `--text` | — | Check a draft (or raw text) against patterns |
| `redline finalize <draft_id>` | `finalize_draft` | Draft→final pair; returns diff analysis + promotions |
| `redline analyze <pair_id>` | `analyze_diff` | Deletions, categorized changes, word swaps, hits |
| `redline add-lesson <pair_id> "<text>" --tags` | `add_lesson` | Store a derived voice lesson |
| `redline add-pattern --rule --pattern --category` | `add_pattern` | Create a matchable pattern (literal or regex) |
| `redline show <pair_id>` | `show_pair` | Read a pair: draft, final, diff |
| `redline recent [N]` | `recent_pairs` | Skim recent finalized pairs |
| `redline drafts [--all]` | `list_drafts` | In-flight drafts (check edit status) |
| `redline delete-draft <id>` | `delete_draft` | Remove a draft (keeps any finalized pair) |

Load the `redline` skill for full details on pattern types (literal vs regex), directions (avoid vs prefer), and the lint engine.

## Failure modes

- **Treating sessions as a summary dump.** You decide what's worth a post; most sessions aren't.
- **Ignoring `thinking` blocks.** The reasoning trace is what makes narrative possible — use it.
- **Storing lessons without patterns.** Patterns are what make future drafts auto-lint. Always pair them.
- **Storing content lessons as voice lessons.** Voice = how, not what.
- **Over-fitting to one edit.** Patterns start `unconfirmed` and auto-promote after 3+ sightings — let the system handle confirmation.
- **Generic lessons.** If you can't say *what specifically changed*, don't store a lesson.
