import { useEffect, useRef, useState } from "react";

export type PageResult<T> = { items: T[]; nextCursor: string | null };

/**
 * A cursor-paged admin list (#4 §5.2): the first page whenever `key` (its
 * filters) changes, 載入更多 appends the next. A response for an older key
 * or an earlier load is dropped, so a slow page never overwrites a newer one,
 * and 載入更多 is refused while a first page is on its way or when the cursor
 * belongs to an older key, so two lists never get mixed.
 */
export function usePagedList<T extends { id: string | number }>(
  key: string,
  enabled: boolean,
  fetchPage: (cursor: string | null) => Promise<PageResult<T>>,
  onError: (e: unknown) => void,
) {
  const [items, setItems] = useState<T[]>([]);
  /** The next page's cursor, and the key it was listed under. */
  const [cursor, setCursor] = useState<{ key: string; next: string | null }>({
    key: "",
    next: null,
  });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const seq = useRef(0);
  const firstPending = useRef(false);
  /**
   * Items removed under `key`, with the load sequence number at removal: a
   * page requested before that (still on its way) must not bring them back.
   */
  const removed = useRef<{ key: string; at: Map<T["id"], number> }>({ key: "", at: new Map() });

  /** Fetches a page (the first when `after` is null) into the list; no state is set before the response. */
  async function load(after: string | null) {
    const n = ++seq.current;
    const forKey = key;
    if (!after) firstPending.current = true;
    try {
      const page = await fetchPage(after);
      if (n !== seq.current) return;
      const gone = removed.current.key === forKey ? removed.current.at : null;
      const items = gone ? page.items.filter((x) => !(n <= (gone.get(x.id) ?? 0))) : page.items;
      setItems((prev) => {
        if (!after) return items;
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...items.filter((x) => !seen.has(x.id))];
      });
      setCursor({ key: forKey, next: page.nextCursor });
      setLoaded(true);
    } catch (e) {
      if (n === seq.current) onError(e);
    } finally {
      if (n === seq.current && !after) firstPending.current = false;
    }
  }

  const more = cursor.key === key && cursor.next !== null;

  async function loadMore() {
    if (firstPending.current || !more || loading) return;
    setLoading(true);
    try {
      await load(cursor.next);
    } finally {
      setLoading(false);
    }
  }

  /** The first page again (same key): the old cursor is dropped at once. */
  function reload() {
    setCursor((c) => ({ ...c, next: null }));
    return load(null);
  }

  // Started from a promise callback: state is only ever set once a page arrives.
  useEffect(() => {
    if (enabled) void Promise.resolve(null).then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return {
    items,
    loaded,
    /** The key the shown items were listed under (lags `key` until its first page arrives). */
    listedKey: cursor.key,
    loading,
    more,
    loadMore,
    reload,
    replace: (item: T) => setItems((prev) => prev.map((x) => (x.id === item.id ? item : x))),
    remove(id: T["id"]) {
      if (removed.current.key !== key) removed.current = { key, at: new Map() };
      removed.current.at.set(id, seq.current);
      setItems((prev) => prev.filter((x) => x.id !== id));
    },
  };
}
