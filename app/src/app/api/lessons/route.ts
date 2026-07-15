import { NextRequest, NextResponse } from "next/server";
import { insertLesson, listLessons, lessonsForPost } from "@/lib/store";

/** GET /api/lessons       — all lessons.  GET /api/lessons?post_id=N — for one post. */
export async function GET(req: NextRequest) {
  const postParam = req.nextUrl.searchParams.get("post_id");
  if (postParam) return NextResponse.json(lessonsForPost(Number(postParam)));
  return NextResponse.json(listLessons());
}

/** POST /api/lessons — store a voice lesson the agent derived from a diff. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const b = body as { lesson?: string; post_id?: number; tags?: string[] };
  if (!b || typeof b.lesson !== "string" || !b.lesson.trim()) {
    return NextResponse.json({ error: "missing lesson" }, { status: 400 });
  }
  const id = insertLesson({ lesson: b.lesson, post_id: b.post_id, tags: b.tags });
  return NextResponse.json({ id }, { status: 201 });
}
