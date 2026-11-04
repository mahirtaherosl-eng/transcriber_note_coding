import { listHistory } from "@/lib/history";
import { assertSafeId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    assertSafeId(id);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const entries = await listHistory(id);
  return Response.json({ entries });
}
