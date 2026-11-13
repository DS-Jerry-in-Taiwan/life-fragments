// Cursor pagination for the admin lists (#4 §5.2): a page is the first
// PAGE_SIZE rows after the cursor, which is the last listed row's sort key
// ([created, id] and the like), encoded as opaque base64url JSON. Each list
// validates the decoded shape itself (lib/server/validation.ts).

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
