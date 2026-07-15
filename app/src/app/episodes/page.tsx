import Link from "next/link";
import { listEpisodes } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function EpisodesPage() {
  const episodes = listEpisodes();
  return (
    <div>
      <header className="border-b px-8 py-6" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-xl font-semibold tracking-tight">Episodes</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          Snapshots of pi session activity, pushed via <code>cfs episode</code>.
        </p>
      </header>

      <main className="mx-auto w-full max-w-3xl px-8 py-8">
        {episodes.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center text-sm text-[var(--muted)]"
            style={{ borderColor: "var(--border)" }}
          >
            No episodes yet. In pi:{" "}
            <code className="bg-[var(--accent-soft)] px-1.5 py-0.5 rounded">
              cfs episode --repo /path/to/repo --days 7
            </code>
          </div>
        ) : (
          <div className="space-y-2">
            {episodes.map((e) => (
              <Link
                key={e.id}
                href={`/episodes/${e.id}`}
                className="block group rounded-xl border p-4 transition-all hover:border-[var(--accent)]"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium group-hover:text-[var(--accent)] transition-colors">
                    {e.repo.split("/").pop()}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--muted)]">{e.repo}</span>
                  <span className="text-[11px] text-[var(--muted)] ml-auto">
                    {new Date(e.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {e.window ?? ""}{e.window && e.summary ? " · " : ""}{e.summary ?? ""}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
