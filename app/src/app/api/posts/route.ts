import { NextRequest, NextResponse } from "next/server";
import { getPost, insertPost, listPosts, updateDraft } from "@/lib/store";

/** GET /api/posts       — list posts.  GET /api/posts?id=N — one post. */
export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  if (idParam) {
    const post = getPost(Number(idParam));
    if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(post);
  }
  return NextResponse.json(listPosts());
}

/** POST /api/posts — create a post from a draft (agent-authored). */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const b = body as {
    draft?: string;
    episode_id?: number;
    content_type?: string;
    source?: string;
    context?: string;
    tags?: string[];
  };
  if (!b || typeof b.draft !== "string" || !b.draft.trim()) {
    return NextResponse.json({ error: "missing draft" }, { status: 400 });
  }
  const id = insertPost({
    draft: b.draft,
    episode_id: b.episode_id,
    content_type: b.content_type,
    source: b.source,
    context: b.context,
    tags: b.tags,
  });
  return NextResponse.json({ id }, { status: 201 });
}

/** PATCH /api/posts — replace the draft body (pre-finalization edits). */
export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const b = body as { id?: number; draft?: string };
  if (!b || typeof b.id !== "number" || typeof b.draft !== "string") {
    return NextResponse.json({ error: "missing id or draft" }, { status: 400 });
  }
  const post = updateDraft(b.id, b.draft);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(post);
}
