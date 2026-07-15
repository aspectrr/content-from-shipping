import Link from "next/link";
import { listLessons } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function LessonsPage() {
  const lessons = listLessons();
  const confirmed = lessons.filter((l) => !l.tags.includes("unconfirmed"));
  const unconfirmed = lessons.filter((l) => l.tags.includes("unconfirmed"));

  return (
    <div>
      <header className="border-b px-8 py-6" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-xl font-semibold tracking-tight">Voice</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          {lessons.length} voice lesson{lessons.length === 1 ? "" : "s"} — how you write, learned from your edits. Pi
          applies these when drafting.
        </p>
      </header>

      <main className="mx-auto w-full max-w-3xl px-8 py-8">
        {lessons.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center text-sm text-[var(--muted)]"
            style={{ borderColor: "var(--border)" }}
          >
            No lessons yet. They accumulate as you edit drafts and pi derives them from the diffs.
          </div>
        ) : (
          <div className="space-y-8">
            {confirmed.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
                  Confirmed · {confirmed.length}
                </h2>
                <ul className="space-y-2">
                  {confirmed.map((l) => (
                    <li
                      key={l.id}
                      className="text-sm rounded-lg border p-3.5 flex gap-2.5"
                      style={{ background: "var(--card)", borderColor: "var(--border)" }}
                    >
                      <span className="text-[var(--accent)] shrink-0">→</span>
                      <span>{l.lesson}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {unconfirmed.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
                  Candidates · {unconfirmed.length}
                </h2>
                <ul className="space-y-2">
                  {unconfirmed.map((l) => (
                    <li
                      key={l.id}
                      className="text-sm rounded-lg border p-3.5 flex gap-2.5"
                      style={{ background: "var(--card)", borderColor: "var(--border)" }}
                    >
                      <span className="text-[var(--muted)] shrink-0">?</span>
                      <span className="text-[var(--muted)]">
                        {l.lesson}
                        {l.post_id != null && (
                          <>
                            {" — "}
                            <Link href={`/posts/${l.post_id}`} className="text-[var(--accent)] underline underline-offset-2">
                              post #{l.post_id}
                            </Link>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
