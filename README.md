# content-from-shipping

Turn pi agent sessions into content — devlogs, changelogs, social posts — in your voice, and learn voice from every edit.

**It's just a skill.** No server, no CLI bridge, no database. The agent (pi, in the terminal) does all the reasoning: it reads session files directly, drafts markdown, and learns voice lessons from your edits via `git diff`. Files are the store; git is the diff engine.

## What's here

| Path | What |
|---|---|
| `skills/content-from-shipping/SKILL.md` | The skill. Teaches the agent to pull conversation history, draft, and learn from edits. |
| `voice/` | Legacy standalone lesson store (Rust, forked from email-for-agents). **Orphaned** — lessons now live in `~/content/VOICE.md`. Kept for reference; safe to delete. |

## How the loop works

```
~/.pi/agent/sessions/*.jsonl   ──agent reads──▶   draft in ~/content/drafts/*.md
                                                      │ you edit in place
                                                      ▼
              ~/content/VOICE.md  ◀──agent derives──  git diff (your edits)
```

1. **Pull history** — the agent reads `~/.pi/agent/sessions/<repo-basename>/*.jsonl` and finds work worth writing about. The reasoning traces (`thinking` blocks) are the gold for narrative.
2. **Draft** — markdown written to `~/content/drafts/<date>-<slug>.md`, then committed (baseline for diffing).
3. **You edit** — in any editor, in place.
4. **Learn** — the agent reads `git diff`, derives voice lessons (how you write, not what), and appends them to `~/content/VOICE.md`. Read back before the next draft.

## Install

```sh
# link the skill so pi discovers it (point at your clone)
ln -sfn "$PWD/skills/content-from-shipping" ~/.pi/agent/skills/content-from-shipping

# bootstrap the content workspace
mkdir -p ~/content/drafts && cd ~/content && git init
```

Then in any pi session, ask it to draft a devlog from recent work. The skill activates.

## Why no app?

An earlier iteration had a Next.js app + `cfs` CLI + a Bun ingester. The app was infrastructure (server, DB, bridge) to serve one step — editing a draft — that a plain editor + git already handles. The agent can read session files itself; it doesn't need an ingester. So it collapsed to a skill. The full history of that iteration is in the git tree if you want it back.
