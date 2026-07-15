import { NextRequest, NextResponse } from "next/server";
import { setFinal } from "@/lib/store";

/** POST /api/posts/[id]/final — set the final (edited) body. App computes the diff. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const b = body as { final?: string };
  if (!b || typeof b.final !== "string") {
    return NextResponse.json({ error: "missing final" }, { status: 400 });
  }
  const post = setFinal(id, b.final);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(post);
}
