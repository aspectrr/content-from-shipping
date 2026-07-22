# content-from-shipping

Turn pi agent sessions into content — devlogs, changelogs, social posts — in your voice, and learn voice from every edit.

**It's just a skill.** No server, no CLI bridge of its own. The agent (pi, in the terminal) reads session files directly to find what's worth writing, then drafts into [redline](https://github.com/aspectrr/redline) — the local revision-pair + voice-pattern library — where the user edits, diffs are computed, and voice lessons accumulate.

## What this skill does

One half of the loop: **pulls conversation history and decides what to write.** The other half — storing drafts, computing diffs, linting against voice patterns, learning from edits — is redline's job.

```
~/.pi/agent/sessions/*.jsonl   ──agent reads──▶   redline draft  →  redline app inbox
                                                      │ user edits in the app
                                                      ▼
                                 redline analyze  ◀──  redline finalize (computes diff)
                                      │
                                      ▼
                                 redline add-lesson + add-pattern  →  voice corpus
```

1. **Pull history** — the agent reads `~/.pi/agent/sessions/<repo-basename>/*.jsonl` and finds work worth writing about. The reasoning traces (`thinking` blocks) are the gold for narrative.
2. **Draft** — pushed via `redline draft`, which auto-lints against stored voice patterns. Lands in the redline app for editing.
3. **You edit** — in the redline Tauri app (or CLI). Every revision is append-only.
4. **Learn** — the agent reads the draft→final diff (`redline analyze`), derives voice lessons, and stores them as lessons + matchable patterns. Future drafts auto-lint against the growing corpus.

## What's here

Just one thing: `skills/content-from-shipping/SKILL.md` — the skill.

## Install

```sh
# link the skill so pi discovers it (point at your clone)
ln -sfn "$PWD/skills/content-from-shipping" ~/.pi/agent/skills/content-from-shipping
```

Requires [redline](https://github.com/aspectrr/redline) installed (`redline` on PATH). For the MCP server (preferred for agents — no subprocess per call), add to pi's config:

```json
{ "mcpServers": { "redline": { "command": "redline", "args": ["mcp"] } } }
```

Then in any pi session, ask it to draft a devlog from recent work. The skill activates.

## Why no app of its own?

An earlier iteration had a Next.js app + `cfs` CLI + a Bun ingester. That collapsed: the agent can read session files itself, and redline already handles the draft→edit→diff→learn loop with a proper editor, structured diffs, and pattern-based linting. No point duplicating it. The full history of those iterations is in the git tree.
