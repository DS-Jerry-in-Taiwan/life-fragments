export function reply(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export type JsonBody = { ok: true; body: unknown } | { ok: false; response: Response };

/**
 * Reads a JSON request body: 415 unless the content type is JSON, 413 when the
 * raw text is longer than `maxLength` characters, 400 when it does not parse.
 * The parsed value may be any JSON value (including null); callers validate it.
 */
export async function readJsonBody(req: Request, maxLength: number): Promise<JsonBody> {
  if (!req.headers.get("content-type")?.includes("application/json"))
    return { ok: false, response: reply({ error: "格式不支援" }, 415) };
  const raw = await req.text();
  if (raw.length > maxLength) return { ok: false, response: reply({ error: "內容太長" }, 413) };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, response: reply({ error: "格式不正確" }, 400) };
  }
}
