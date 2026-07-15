import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, lessonsForPost } from "@/lib/store";
import PostEditor from "@/components/PostEditor";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const post = getPost(id);
  if (!post) notFound();
  const lessons = lessonsForPost(id);

  return (
    <div>
      <div className="border-b px-8 pt-6 pb-5" style={{ borderColor: "var(--border)" }}>
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--accent)]">
          ← content
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-lg font-semibold">Post #{post.id}</h1>
          {post.content_type && (
            <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{post.content_type}</span>
          )}
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded-full border"
            style={{
              borderColor: post.status === "finalized" ? "var(--border)" : "var(--accent)",
              color: post.status === "finalized" ? "var(--muted)" : "var(--accent)",
              background: post.status === "finalized" ? "transparent" : "var(--accent-soft)",
            }}
          >
            {post.status}
          </span>
        </div>
        {(post.source || post.context) && (
          <p className="text-xs text-[var(--muted)] mt-1">
            {post.source && <span className="font-mono">{post.source}</span>}
            {post.source && post.context ? " · " : ""}
            {post.context}
          </p>
        )}
      </div>

      <PostEditor
        postId={post.id}
        draft={post.draft}
        initialFinal={post.final}
        diff={post.diff}
        lessons={lessons}
      />
    </div>
  );
}
