import Link from "next/link";
import { notFound } from "next/navigation";
import { getEpisode } from "@/lib/store";

export const dynamic = "force-dynamic";

interface SessionSummary {
  id?: string;
  startedAt?: string;
  model?: string;
  thinkingLevel?: string;
  userTurnCount?: number;
  messageCount?: number;
  intents?: string[];
  reasoning?: string[];
  actions?: { tool: string; summary: string }[];
  timeline?: { t: string; role: string; kind: string; text: string }[];
}

interface EpisodePayload {
  repo?: string;
  window?: { from?: string; to?: string; days?: number };
  generatedAt?: string;
  sessionCount?: number;
  sessions?: SessionSummary[];
  aggregate?: { totalUserTurns?: number; totalActions?: number; toolsUsed?: Record<string, number>; allIntents?: string[] };
}

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const ep = getEpisode(Number(idStr));
  if (!ep) notFound();
  const data = ep.payload as EpisodePayload;
  const sessions = data.sessions ?? [];
  const tools = data.aggregate?.toolsUsed ?? {};

  return (
    <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--accent)]">
          ← back
        </Link>
        <h1 className="text-xl font-semibold mt-3">{ep.repo.split("/").pop()}</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          <span className="font-mono">{ep.repo}</span> · {ep.window ?? ""} · {sessions.length} session
          {sessions.length === 1 ? "" : "s"} · {data.aggregate?.totalUserTurns ?? 0} turns ·{" "}
          {data.aggregate?.totalActions ?? 0} actions
        </p>
      </div>

      {Object.keys(tools).length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Tools used</h2>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(tools)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <span
                  key={name}
                  className="text-[11px] font-mono px-2 py-0.5 rounded border"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  {name} · {count}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {sessions.map((s, i) => (
          <article
            key={s.id ?? i}
            className="rounded-lg border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <header className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-sm font-medium">Session {i + 1}</span>
              {s.model && <span className="text-[11px] font-mono text-[var(--muted)]">{s.model}</span>}
              {s.startedAt && (
                <span className="text-[11px] text-[var(--muted)]">
                  {new Date(s.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              )}
              <span className="text-[11px] text-[var(--muted)] ml-auto">
                {s.userTurnCount} turns · {s.messageCount} msgs
              </span>
            </header>

            {s.intents && s.intents.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1">Intents</div>
                <ul className="space-y-1">
                  {s.intents.slice(0, 6).map((t, j) => (
                    <li key={j} className="text-sm">
                      <span className="text-[var(--accent)]">›</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {s.reasoning && s.reasoning.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1">Reasoning</div>
                <ul className="space-y-1 text-[var(--muted)]">
                  {s.reasoning.slice(0, 4).map((t, j) => (
                    <li key={j} className="text-xs italic">{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {s.actions && s.actions.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1">
                  Actions ({s.actions.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {s.actions.slice(0, 20).map((a, j) => (
                    <span
                      key={j}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: "var(--accent-soft)", color: "var(--muted)" }}
                      title={a.summary}
                    >
                      {a.tool}
                    </span>
                  ))}
                  {s.actions.length > 20 && (
                    <span className="text-[10px] text-[var(--muted)]">+{s.actions.length - 20} more</span>
                  )}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
