import { NextRequest, NextResponse } from "next/server";
import { getEpisode, insertEpisode, listEpisodes } from "@/lib/store";

/** GET /api/episodes        — list episodes.  GET /api/episodes?id=N — one episode. */
export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  if (idParam) {
    const id = Number(idParam);
    const ep = getEpisode(id);
    if (!ep) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(ep);
  }
  return NextResponse.json(listEpisodes());
}

/** POST /api/episodes — push an episode JSON (from the ingester via the CLI). */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const payload = body as {
    repo?: string;
    window?: { from?: string; to?: string; days?: number } | string;
    sessions?: unknown[];
    aggregate?: { totalUserTurns?: number; totalActions?: number };
  };

  if (!payload || typeof payload !== "object" || !payload.repo) {
    return NextResponse.json({ error: "missing repo" }, { status: 400 });
  }

  const window =
    typeof payload.window === "string"
      ? payload.window
      : payload.window
        ? `${payload.window.days ?? "?"}d`
        : null;
  const summary =
    payload.aggregate != null
      ? `${payload.sessions?.length ?? 0} sessions · ${payload.aggregate.totalUserTurns ?? 0} turns`
      : null;

  const id = insertEpisode({
    repo: payload.repo,
    window: window ?? undefined,
    summary: summary ?? undefined,
    payload,
  });
  return NextResponse.json({ id }, { status: 201 });
}
