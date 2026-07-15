import Link from "next/link";
import { listPosts } from "@/lib/store";
import type { PostRecord } from "@/lib/store";

export const dynamic = "force-dynamic";

function titleOf(body: string): string {
  const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "(untitled)";
  return line.replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "");
}

function excerpt(body: string): string {
  return body
    .replace(/^#.*$/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function StatusPill({ status }: { status: string }) {
  const finalized = status === "finalized";
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-full border"
      style={{
        borderColor: finalized ? "var(--border)" : "var(--accent)",
        color: finalized ? "var(--muted)" : "var(--accent)",
        background: finalized ? "transparent" : "var(--accent-soft)",
      }}
    >
      {finalized ? "finalized" : "draft"}
    </span>
  );
}

function PostCard({ post }: { post: PostRecord }) {
  const body = post.final ?? post.draft;
  return (
    <Link
      href={`/posts/${post.id}`}
      className="block group rounded-xl border p-5 transition-all hover:border-[var(--accent)] hover:shadow-sm"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <StatusPill status={post.status} />
        {post.content_type && (
          <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{post.content_type}</span>
        )}
        <span className="text-[11px] text-[var(--muted)] ml-auto">
          {new Date(post.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>
      <div className="text-base font-medium text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
        {titleOf(body)}
      </div>
      <div className="text-sm text-[var(--muted)] mt-1 line-clamp-2">{excerpt(body)}</div>
      {post.tags.length > 0 && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {post.tags.map((t) => (
            <span key={t} className="text-[10px] text-[var(--muted)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export default function Home() {
  const posts = listPosts();
  const drafts = posts.filter((p) => p.status === "draft");
  const finalized = posts.filter((p) => p.status === "finalized");

  return (
    <div>
      <header className="border-b px-8 py-6 flex items-baseline justify-between" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Content</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {drafts.length} draft{drafts.length === 1 ? "" : "s"} · {finalized.length} finalized
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-8 py-8">
        {posts.length === 0 ? (
          <div
            className="rounded-xl border border-dashed p-12 text-center"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="text-sm text-[var(--muted)] mb-4">No content yet. In a pi session:</div>
            <pre className="text-xs bg-[var(--accent-soft)] inline-block px-4 py-2.5 rounded-lg text-[var(--foreground)]">
{`cfs episode --repo /path/to/repo --days 7
# pi reads it, drafts, then:
cfs draft post.md --type devlog`}
            </pre>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
