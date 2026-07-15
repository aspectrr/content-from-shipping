// content-learn: store (draft, final) content pairs + agent-derived voice lessons in SQLite.
//
// Faithful fork of email-for-agents, specialized for content (devlogs, changelogs,
// social posts). Same design principle: the CLI never calls an LLM. It stores pairs,
// computes diffs, and retrieves. All reasoning (picking what to write, deriving voice
// lessons from edits) happens in the agent session via the content-from-shipping skill.
//
// Content-specific additions over email-for-agents:
//   - pairs carry a content_type (devlog | changelog | social | …)
//   - pairs carry a source (the episode / repo+window / corpus they came from)
//   - `add` takes the final as the positional arg and an optional --draft, so a
//     baseline exemplar (final only, no draft) can be stored directly from a corpus.

use clap::{Parser, Subcommand};
use rusqlite::{params, Connection};
use serde::Serialize;
use similar::{ChangeTag, TextDiff};
use std::path::PathBuf;
use std::process::ExitCode;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS pairs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    draft         TEXT NOT NULL,
    final         TEXT NOT NULL,
    diff          TEXT NOT NULL,
    content_type  TEXT,
    source        TEXT,
    context       TEXT,
    tags          TEXT,
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lessons (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    pair_id       INTEGER REFERENCES pairs(id) ON DELETE SET NULL,
    lesson        TEXT NOT NULL,
    tags          TEXT,
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pairs_tags ON pairs(tags);
CREATE INDEX IF NOT EXISTS idx_pairs_type ON pairs(content_type);
CREATE INDEX IF NOT EXISTS idx_lessons_tags ON lessons(tags);
CREATE INDEX IF NOT EXISTS idx_lessons_tags_lesson ON lessons(tags, lesson);
";

fn db_path() -> PathBuf {
    if let Ok(p) = std::env::var("CONTENT_LEARN_DB") {
        return PathBuf::from(p);
    }
    let mut p = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    p.push(".content-learn");
    p.push("voice.db");
    p
}

fn connect() -> anyhow::Result<Connection> {
    let p = db_path();
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(p)?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Unified-diff-style text, line-based. Prose diffs don't need char granularity.
fn unified_diff(old: &str, new: &str) -> String {
    if old.is_empty() {
        // Baseline exemplar (final only): no diff, just the final body.
        return String::new();
    }
    let diff = TextDiff::from_lines(old, new);
    let mut out = String::new();
    for change in diff.iter_all_changes() {
        let sign = match change.tag() {
            ChangeTag::Delete => '-',
            ChangeTag::Insert => '+',
            ChangeTag::Equal => ' ',
        };
        let text = change.value();
        out.push(sign);
        out.push_str(text);
        if !text.ends_with('\n') {
            out.push('\n');
        }
    }
    out
}

#[derive(Parser)]
#[command(
    name = "content-learn",
    version,
    about = "Store (draft, final) content pairs + voice lessons for agent learning."
)]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Store a new content pair. The final is required; --draft is optional
    /// (omit it for a baseline exemplar seeded from a corpus). Prints the new pair id.
    Add {
        /// Path to the final (edited / published) version.
        final_path: PathBuf,
        /// Path to the draft version. If omitted, draft is empty (baseline exemplar).
        #[arg(long)]
        draft: Option<PathBuf>,
        /// Content type: devlog, changelog, social, …
        #[arg(long)]
        content_type: Option<String>,
        /// Where this came from: an episode ref ("repo:last-7d"), a corpus path, etc.
        #[arg(long)]
        source: Option<String>,
        /// Free-form context (topic, audience, intent).
        #[arg(long)]
        context: Option<String>,
        /// Comma-separated tags.
        #[arg(long, value_delimiter = ',')]
        tags: Vec<String>,
    },
    /// Show one pair (draft, final, diff, metadata) for in-session lesson derivation.
    Show { id: i64 },
    /// List the N most recent pairs.
    #[command(alias = "ls")]
    Recent {
        #[arg(default_value = "10")]
        n: usize,
        /// Filter by content type.
        #[arg(long)]
        content_type: Option<String>,
    },
    /// List stored voice lessons, optionally filtered by tag.
    Lessons {
        #[arg(long, value_delimiter = ',')]
        tags: Vec<String>,
    },
    /// Store a lesson derived from a pair by the agent.
    AddLesson {
        pair_id: i64,
        lesson: String,
        #[arg(long, value_delimiter = ',')]
        tags: Vec<String>,
    },
    /// LIKE search across pairs (context, tags, source, final body) and lessons.
    Query { needle: String },
    /// Dump everything as markdown for bulk injection into an agent prompt.
    Export,
}

#[derive(Serialize)]
struct Pair {
    id: i64,
    draft: String,
    final_: String,
    diff: String,
    content_type: Option<String>,
    source: Option<String>,
    context: Option<String>,
    tags: Vec<String>,
    created_at: String,
}

#[derive(Serialize)]
struct Lesson {
    id: i64,
    pair_id: Option<i64>,
    lesson: String,
    tags: Vec<String>,
    created_at: String,
}

fn parse_tags(s: Option<&str>) -> Vec<String> {
    match s {
        None | Some("") => Vec::new(),
        Some(t) => serde_json::from_str::<Vec<String>>(t).unwrap_or_default(),
    }
}

fn tags_to_json(tags: &[String]) -> String {
    serde_json::to_string(tags).unwrap_or_else(|_| "[]".into())
}

fn read_text(path: &std::path::Path) -> anyhow::Result<String> {
    std::fs::read_to_string(path)
        .map_err(|e| anyhow::anyhow!("read {}: {e}", path.display()))
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::FAILURE
        }
    }
}

fn row_to_pair(r: &rusqlite::Row) -> rusqlite::Result<Pair> {
    let tags: Vec<String> = parse_tags(r.get::<_, Option<String>>(7)?.as_deref());
    Ok(Pair {
        id: r.get(0)?,
        draft: r.get(1)?,
        final_: r.get(2)?,
        diff: r.get(3)?,
        content_type: r.get(4)?,
        source: r.get(5)?,
        context: r.get(6)?,
        tags,
        created_at: r.get(8)?,
    })
}

const PAIR_COLS: &str = "id, draft, final, diff, content_type, source, context, tags, created_at";

fn run() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let conn = connect()?;
    match cli.cmd {
        Cmd::Add {
            final_path,
            draft,
            content_type,
            source,
            context,
            tags,
        } => {
            let final_ = read_text(&final_path)?;
            let draft_text = match &draft {
                Some(p) => read_text(p)?,
                None => String::new(),
            };
            let diff = unified_diff(&draft_text, &final_);
            let tags_json = tags_to_json(&tags);
            let now = now_iso();
            conn.execute(
                "INSERT INTO pairs (draft, final, diff, content_type, source, context, tags, created_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![draft_text, final_, diff, content_type, source, context, tags_json, now],
            )?;
            let id = conn.last_insert_rowid();
            println!("{id}");
            Ok(())
        }
        Cmd::Show { id } => {
            let mut stmt = conn.prepare(&format!("SELECT {PAIR_COLS} FROM pairs WHERE id = ?1"))?;
            let mut rows = stmt.query(params![id])?;
            if let Some(r) = rows.next()? {
                let p = row_to_pair(r)?;
                println!("{}", serde_json::to_string_pretty(&p)?);
            } else {
                eprintln!("no pair with id {id}");
            }
            Ok(())
        }
        Cmd::Recent { n, content_type } => {
            let mut out = Vec::new();
            if let Some(ct) = content_type {
                let mut stmt = conn.prepare(&format!(
                    "SELECT {PAIR_COLS} FROM pairs WHERE content_type = ?1 ORDER BY id DESC LIMIT ?2"
                ))?;
                let rows = stmt.query_map(params![ct, n as i64], row_to_pair)?;
                for r in rows {
                    out.push(r?);
                }
            } else {
                let mut stmt =
                    conn.prepare(&format!("SELECT {PAIR_COLS} FROM pairs ORDER BY id DESC LIMIT ?1"))?;
                let rows = stmt.query_map(params![n as i64], row_to_pair)?;
                for r in rows {
                    out.push(r?);
                }
            }
            println!("{}", serde_json::to_string_pretty(&out)?);
            Ok(())
        }
        Cmd::Lessons { tags } => {
            let mut out: Vec<Lesson> = Vec::new();
            if tags.is_empty() {
                let mut stmt = conn.prepare(
                    "SELECT id, pair_id, lesson, tags, created_at FROM lessons ORDER BY id DESC",
                )?;
                let rows = stmt.query_map([], |r| {
                    let t: Vec<String> = parse_tags(r.get::<_, Option<String>>(3)?.as_deref());
                    Ok(Lesson {
                        id: r.get(0)?,
                        pair_id: r.get(1)?,
                        lesson: r.get(2)?,
                        tags: t,
                        created_at: r.get(4)?,
                    })
                })?;
                for x in rows {
                    out.push(x?);
                }
            } else {
                let pats: Vec<String> = tags
                    .iter()
                    .map(|t| format!("%\"{}\"%", t.replace('"', "\\\"")))
                    .collect();
                let placeholders = (0..pats.len())
                    .map(|_| "tags LIKE ?")
                    .collect::<Vec<_>>()
                    .join(" OR ");
                let sql = format!(
                    "SELECT id, pair_id, lesson, tags, created_at FROM lessons WHERE {placeholders} ORDER BY id DESC"
                );
                let mut stmt = conn.prepare(&sql)?;
                let refs: Vec<&dyn rusqlite::ToSql> =
                    pats.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
                let rows = stmt.query_map(refs.as_slice(), |r| {
                    let t: Vec<String> = parse_tags(r.get::<_, Option<String>>(3)?.as_deref());
                    Ok(Lesson {
                        id: r.get(0)?,
                        pair_id: r.get(1)?,
                        lesson: r.get(2)?,
                        tags: t,
                        created_at: r.get(4)?,
                    })
                })?;
                for x in rows {
                    out.push(x?);
                }
            }
            println!("{}", serde_json::to_string_pretty(&out)?);
            Ok(())
        }
        Cmd::AddLesson { pair_id, lesson, tags } => {
            let tags_json = tags_to_json(&tags);
            let now = now_iso();
            conn.execute(
                "INSERT INTO lessons (pair_id, lesson, tags, created_at) VALUES (?1,?2,?3,?4)",
                params![pair_id, lesson, tags_json, now],
            )?;
            println!("{}", conn.last_insert_rowid());
            Ok(())
        }
        Cmd::Query { needle } => {
            let pat = format!("%{needle}%");
            let mut pairs: Vec<Pair> = Vec::new();
            {
                let mut stmt = conn.prepare(&format!(
                    "SELECT {PAIR_COLS} FROM pairs \
                     WHERE context LIKE ?1 OR tags LIKE ?1 OR source LIKE ?1 OR final LIKE ?1 OR draft LIKE ?1 \
                     ORDER BY id DESC LIMIT 50"
                ))?;
                let rows = stmt.query_map(params![pat], row_to_pair)?;
                for x in rows {
                    pairs.push(x?);
                }
            }
            let mut lessons: Vec<Lesson> = Vec::new();
            {
                let mut stmt = conn.prepare(
                    "SELECT id, pair_id, lesson, tags, created_at FROM lessons \
                     WHERE lesson LIKE ?1 OR tags LIKE ?1 ORDER BY id DESC LIMIT 50",
                )?;
                let rows = stmt.query_map(params![pat], |r| {
                    let t: Vec<String> = parse_tags(r.get::<_, Option<String>>(3)?.as_deref());
                    Ok(Lesson {
                        id: r.get(0)?,
                        pair_id: r.get(1)?,
                        lesson: r.get(2)?,
                        tags: t,
                        created_at: r.get(4)?,
                    })
                })?;
                for x in rows {
                    lessons.push(x?);
                }
            }
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::json!({
                    "pairs": pairs,
                    "lessons": lessons,
                }))?
            );
            Ok(())
        }
        Cmd::Export => {
            let mut pairs: Vec<Pair> = Vec::new();
            {
                let mut stmt =
                    conn.prepare(&format!("SELECT {PAIR_COLS} FROM pairs ORDER BY id ASC"))?;
                let rows = stmt.query_map([], row_to_pair)?;
                for x in rows {
                    pairs.push(x?);
                }
            }
            let mut lessons: Vec<Lesson> = Vec::new();
            {
                let mut stmt = conn.prepare(
                    "SELECT id, pair_id, lesson, tags, created_at FROM lessons ORDER BY id ASC",
                )?;
                let rows = stmt.query_map([], |r| {
                    let t: Vec<String> = parse_tags(r.get::<_, Option<String>>(3)?.as_deref());
                    Ok(Lesson {
                        id: r.get(0)?,
                        pair_id: r.get(1)?,
                        lesson: r.get(2)?,
                        tags: t,
                        created_at: r.get(4)?,
                    })
                })?;
                for x in rows {
                    lessons.push(x?);
                }
            }

            let mut md = String::new();
            md.push_str("# Content Voice Lessons (exported)\n\n");
            md.push_str("## Lessons\n\n");
            if lessons.is_empty() {
                md.push_str("_(none yet)_\n\n");
            }
            for l in &lessons {
                md.push_str(&format!(
                    "- **L{}** (pair #{}) [{}] {}: {}  _{}_\n",
                    l.id,
                    l.pair_id.map(|i| i.to_string()).unwrap_or_else(|| "—".into()),
                    l.tags.join(","),
                    l.lesson,
                    "",
                    l.created_at
                ));
            }
            md.push_str("\n## Pairs\n\n");
            for p in &pairs {
                md.push_str(&format!("### Pair #{} — {}\n", p.id, p.created_at));
                if let Some(c) = &p.content_type {
                    md.push_str(&format!("type: {c}\n"));
                }
                if let Some(s) = &p.source {
                    md.push_str(&format!("source: {s}\n"));
                }
                if let Some(c) = &p.context {
                    md.push_str(&format!("context: {c}\n"));
                }
                if !p.tags.is_empty() {
                    md.push_str(&format!("tags: {}\n", p.tags.join(", ")));
                }
                md.push_str("\n#### Draft\n```\n");
                md.push_str(if p.draft.is_empty() { "_(baseline — no draft)_\n" } else { &p.draft });
                if !p.draft.is_empty() && !p.draft.ends_with('\n') {
                    md.push('\n');
                }
                md.push_str("```\n#### Final\n```\n");
                md.push_str(&p.final_);
                if !p.final_.ends_with('\n') {
                    md.push('\n');
                }
                if !p.diff.is_empty() {
                    md.push_str("```\n#### Diff\n```diff\n");
                    md.push_str(&p.diff);
                    if !p.diff.ends_with('\n') {
                        md.push('\n');
                    }
                }
                md.push_str("```\n\n");
            }
            println!("{md}");
            Ok(())
        }
    }
}
