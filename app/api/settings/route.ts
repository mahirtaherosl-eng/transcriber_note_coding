import { SettingsUpdateSchema } from "@/lib/settings/schema";
import { getSettingsStatus, updateSettings } from "@/lib/settings/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return json(getSettingsStatus());
}

export async function PUT(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "Expected application/json." }, 415);
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return json({ error: "Cross-origin request rejected." }, 403);
      }
    } catch {
      return json({ error: "Invalid origin." }, 403);
    }
  }

  const text = await request.text();
  if (text.length > 16 * 1024) {
    return json({ error: "Request body is too large." }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const parsed = SettingsUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json(
      {
        error: issue
          ? `Invalid ${issue.path.join(".") || "settings"}: ${issue.message}`
          : "Invalid settings.",
      },
      400,
    );
  }

  try {
    return json(await updateSettings(parsed.data));
  } catch {
    // Never include the request body or a raw error that could echo a key.
    return json({ error: "Could not save settings." }, 500);
  }
}
