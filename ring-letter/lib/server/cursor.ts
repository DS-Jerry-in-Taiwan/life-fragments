// Opaque tokens of the admin API (#4 §5.2), both base64url JSON; no imports,
// so tests/admin.test.mjs runs it under plain Node.
// - Cursor pagination for the admin lists: a page is the first PAGE_SIZE rows
//   after the cursor, which is the last listed row's sort key ([created, id]
//   and the like). Each list validates the decoded shape itself
//   (lib/server/validation.ts).
// - A story's revision, which the admin story list shows and a decision
//   sends back (encodeRevision() / decodeRevision()).

export const PAGE_SIZE = 50;

export function encodeCursor(key: (string | number)[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(key));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The decoded JSON value, or undefined when `cursor` is not one encodeCursor() made. */
export function decodeCursor(cursor: string): unknown {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return undefined;
    const binary = atob(cursor.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

/**
 * `rows` as fetched with LIMIT PAGE_SIZE + 1: the page, and the cursor of its
 * last row when there are more (null at the end).
 */
export function paginate<T>(rows: T[], keyOf: (row: T) => (string | number)[]) {
  const page = rows.slice(0, PAGE_SIZE);
  const nextCursor = rows.length > PAGE_SIZE ? encodeCursor(keyOf(page[page.length - 1])) : null;
  return { page, nextCursor };
}

/**
 * What a story's revision stands for: when its status was last set
 * (COALESCE(status_at, created)) and how many consent events it has. A
 * decision is refused if either changed since the list showed it; the event
 * count catches changes within the same millisecond (every sharing change
 * writes an event, even one that ends in the status it started from).
 */
export type Revision = { statusAt: number; consentEvents: number };

export function encodeRevision({ statusAt, consentEvents }: Revision): string {
  return encodeCursor([statusAt, consentEvents]);
}

const count = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;

/** The revision encodeRevision() made, or undefined for anything else. */
export function decodeRevision(revision: string): Revision | undefined {
  const v = decodeCursor(revision);
  if (!Array.isArray(v) || v.length !== 2 || !count(v[0]) || !count(v[1])) return undefined;
  return { statusAt: v[0], consentEvents: v[1] };
}
