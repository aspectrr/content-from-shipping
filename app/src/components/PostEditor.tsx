"use client";
import { useRef, useState } from "react";
import type { LessonRecord } from "@/lib/store";
import Markdown from "./Markdown";

interface Props {
  postId: number;
  draft: string;
  initialFinal: string | null;
  diff: string | null;
  lessons: LessonRecord[];
}

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

export default function PostEditor({ postId, draft, initialFinal, diff, lessons }: Props) {
  const [text, setText] = useState(initialFinal ?? draft);
  const [saving, setSaving] = useState(false);
  const [savedDiff, setSavedDiff] = useState<string | null>(diff);
  const [showDraft, setShowDraft] = useState(false);
  const [lessonText, setLessonText] = useState("");
  const [lessonList, setLessonList] = useState<LessonRecord[]>(lessons);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const dirty = text !== (initialFinal ?? draft);
  const saved = !!initialFinal;

  /** Wrap the current selection (or insert markers). */
  function wrap(prefix: string, suffix = prefix) {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e);
    const next = value.slice(0, s) + prefix + sel + suffix + value.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + prefix.length;
      ta.selectionEnd = e + prefix.length;
    });
  }

  /** Prefix each selected line (or current line). */
  function linePrefix(prefix: string) {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, value } = ta;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    setText(next);
    requestAnimationFrame(() => ta.focus());
  }

  async function saveFinal() {
    setSaving(true);
    const res = await fetch(`/api/posts/${postId}/final`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ final: text }),
    });
    if (res.ok) {
      const post = await res.json();
      setSavedDiff(post.diff ?? "");
    }
    setSaving(false);
  }

  async function addLesson() {
    if (!lessonText.trim()) return;
    const res = await fetch("/api/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson: lessonText, post_id: postId }),
    });
    if (res.ok) {
      const { id } = await res.json();
      setLessonList((l) => [
        ...l,
        { id, post_id: postId, lesson: lessonText, tags: [], created_at: new Date().toISOString() },
      ]);
      setLessonText("");
    }
  }

  const toolBtn =
    "h-7 min-w-7 px-1.5 rounded text-xs font-medium transition-colors hover:bg-[var(--accent-soft)] text-[var(--muted)] hover:text-[var(--accent)]";

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      {/* action bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="text-sm text-[var(--muted)]">
          {wordCount(text)} words · {text.length.toLocaleString()} chars
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowDraft((v) => !v)}
            className="text-xs px-2.5 py-1.5 rounded-md border transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          >
            {showDraft ? "hide" : "show"} original draft
          </button>
          <button
            onClick={saveFinal}
            disabled={saving || !dirty}
            className="text-xs font-medium px-3.5 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {saving ? "saving…" : saved ? "save changes" : "save as final"}
          </button>
        </div>
      </div>

      {/* original draft (collapsible) */}
      {showDraft && (
        <div
          className="rounded-lg border p-5 mb-5"
          style={{ background: "var(--sidebar)", borderColor: "var(--border)" }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
            Original draft from pi
          </div>
          <div className="text-sm opacity-90">
            <Markdown>{draft}</Markdown>
          </div>
        </div>
      )}

      {/* split editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px rounded-xl overflow-hidden border"
        style={{ borderColor: "var(--border)", background: "var(--border)" }}
      >
        {/* write pane */}
        <div className="flex flex-col" style={{ background: "var(--card)" }}>
          <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mr-2">Write</span>
            <button className={toolBtn} onClick={() => linePrefix("## ")} title="Heading">H</button>
            <button className={toolBtn} onClick={() => wrap("**")} title="Bold"><b>B</b></button>
            <button className={toolBtn} onClick={() => wrap("*")} title="Italic"><i>I</i></button>
            <button className={toolBtn} onClick={() => wrap("`")} title="Code">{"<>"}</button>
            <button className={toolBtn} onClick={() => linePrefix("- ")} title="List">•</button>
            <button className={toolBtn} onClick={() => linePrefix("> ")} title="Quote">”</button>
            <button className={toolBtn} onClick={() => wrap("[", "](url)")} title="Link">🔗</button>
          </div>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder="Write in markdown…"
            className="flex-1 min-h-[60vh] w-full p-5 text-[0.95rem] leading-relaxed bg-transparent outline-none resize-none font-[var(--font-geist-mono)]"
            style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
          />
        </div>

        {/* preview pane */}
        <div className="flex flex-col" style={{ background: "var(--card)" }}>
          <div className="px-4 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Preview</span>
          </div>
          <div className="flex-1 min-h-[60vh] p-6 overflow-auto">
            <Markdown>{text}</Markdown>
          </div>
        </div>
      </div>

      {/* diff */}
      {savedDiff && (
        <section className="mt-6 rounded-lg border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
            Diff — what you changed vs the draft
          </h2>
          <pre className="text-xs font-mono whitespace-pre-wrap">
            {savedDiff.split("\n").map((line, i) => (
              <div
                key={i}
                className={line.startsWith("+") ? "diff-line-add" : line.startsWith("-") ? "diff-line-del" : ""}
              >
                {line || " "}
              </div>
            ))}
          </pre>
          <p className="text-[11px] text-[var(--muted)] mt-3">
            pi reads this via <code>cfs posts</code> and derives voice lessons.
          </p>
        </section>
      )}

      {/* lessons */}
      <section className="mt-6 rounded-lg border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
          Voice lessons from this post ({lessonList.length})
        </h2>
        {lessonList.length > 0 && (
          <ul className="space-y-1.5 mb-4">
            {lessonList.map((l) => (
              <li key={l.id} className="text-sm flex gap-2">
                <span className="text-[var(--accent)] shrink-0">→</span>
                <span>{l.lesson}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={lessonText}
            onChange={(e) => setLessonText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLesson()}
            placeholder={`Add a voice lesson… (or let pi derive it: cfs lesson "…" --post ${postId})`}
            className="flex-1 text-sm px-3 py-2 rounded-md border bg-transparent outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
          <button
            onClick={addLesson}
            className="text-xs font-medium px-3 py-2 rounded-md border hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          >
            add
          </button>
        </div>
      </section>
    </div>
  );
}
