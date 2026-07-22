---
name: content-from-shipping
description: >-
  Turn pi agent sessions into content — devlogs, changelogs, social posts — in the
  user's voice, and learn voice from every edit. No server, no CLI bridge: the
  agent reads session files directly, writes drafts as markdown, and learns from
  git diffs. Activate when the user wants to write about work they shipped, pull
  conversation history from recent sessions, draft a devlog, or learn voice from
  an edit they made.
---

# content-from-shipping

Turn shipping into content in the user's voice. **You (the agent) do everything**: read the session files, decide what's worth writing, draft it as markdown, and — after the user edits — derive voice lessons from the diff. The only infrastructure is files and git.

## Where things live

| Thing | Path | Notes |
|---|---|---|
| pi sessions | `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl` | `$PI_HOME/agent/sessions` if `PI_HOME` set |
| content root | `~/content` (override: `$CFS_CONTENT`) | a git repo you manage |
| drafts | `<content>/drafts/<YYYY-MM-DD>-<slug>.md` | you write here; user edits in place |
| voice lessons | `<content>/VOICE.md` | how the user writes; read before drafting |

If `<content>` isn't a git repo yet, bootstrap it: `mkdir -p ~/content/drafts && cd ~/content && git init`. Commit drafts so `git diff` can reveal the user's later edits.

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

For the full, unabridged record (every block, every turn), just `read` the file directly — sessions aren't large. Use the jq extract to triage many sessions fast, then `read` the one or two worth writing about.

## Workflow A — draft a new piece

1. **Find recent work.** Ask which repo (or take the busiest). List its recent sessions (above). Scan headers + intents to see what happened.
2. **Calibrate voice before writing.** `read ~/content/VOICE.md`. Those are the rules. On cold start (empty file) draft to your best general standard; the loop teaches you from the first edit.
3. **Pick the highest-signal session.** Not every session is a post. Worth writing when there's: a clear stated intent, an interesting journey (a decision, a course correction, a dead end), and a tangible outcome. **The `thinking` blocks are the gold** — that's the "why" and "what was hard." Most sessions aren't a post; you decide.
4. **Draft** in the requested format (default devlog), applying every applicable voice lesson. Write to `<content>/drafts/<YYYY-MM-DD>-<slug>.md`.
5. **Commit it** so there's a baseline for later diffing: `git -C ~/content add drafts/<file> && git -C ~/content commit -m "draft: <slug>"`.
6. **Hand off.** Tell the user the path to edit. Don't finalize yourself unless asked.

## Workflow B — learn from an edit (the closed loop)

This is where voice compounds. The user edited your draft.

1. **See what they changed:**
   ```bash
   git -C ~/content diff -- drafts/<file>.md          # uncommitted edits vs the committed draft
   # or, if they committed the final:
   git -C ~/content log --oneline -- drafts/<file>.md
   git -C ~/content diff <draft-sha>..HEAD -- drafts/<file>.md
   ```
2. **Derive 1–3 specific voice lessons** from the diff (see *What counts as a good lesson*). Voice = *how they write*, not what they chose to write about.
3. **Append each to `~/content/VOICE.md`** — under `## Candidates` if it's the first sighting, or promote to `## Confirmed` if you've seen the pattern 2–3 times.
4. Commit: `git -C ~/content add VOICE.md drafts/<file> && git -C ~/content commit -m "learn: <slug>"`.

## What counts as a good lesson

Specific, actionable, voice-coded. Names a swap or structural move you can repeat; about *how the user writes*, not correctness.

Good:
- "Open devlogs with the question or tension, not a week-in-review."
- "Cut hedging: 'I think we should' → 'We should.'"
- "Never end a section with a significance summary."

Bad (reject):
- "Be clear and engaging." (generic)
- "Mention the repo name." (content, not voice)

**Negative lessons are gold** — things the user never does. Capture them. Don't over-fit: a swap seen once is a candidate; promote only after 2–3 sightings.

## VOICE.md shape

```markdown
# Voice

How the user writes. Derived from draft→final edits. Read before drafting.

## Confirmed
(repeatable across ≥2 posts)
- Open with the tension, not "This week I…".
- …

## Candidates
(seen once — promote after a repeat)
- …
```

## Format guidance

- **Devlog** — narrative. Hook (the question/tension) → journey (decisions, one wrong turn) → outcome. First person, direct. Uses reasoning traces heavily.
- **Changelog** — terse, user-facing. Grouped bullets, what changed for the user. No journey.
- **Social** — one idea, punchy. A single insight distilled, not a recap.

Default to devlog when unspecified.

## Failure modes

- **Treating sessions as a summary dump.** You decide what's worth a post; most sessions aren't.
- **Ignoring `thinking` blocks.** The reasoning trace is what makes narrative possible — use it.
- **Storing content lessons as voice lessons.** Voice = how, not what.
- **Over-fitting to one edit.** Confirm across posts before promoting.
- **Generic lessons.** If you can't say *what specifically changed*, don't store a lesson.
