import { useEffect, useRef, useState } from "react";

export type PageResult<T> = { items: T[]; nextCursor: string | null };

/**
 * A cursor-paged admin list (#4 §5.2): the first page whenever `key` (its
 * filters) changes, 載入更多 appends the next. A response for an older key
 * or an earlier load is dropped, so a slow page never overwrites a newer one.
 */
export function usePagedList<T extends { id: string | number }>(
  key: string,
  enabled: boolean,
  fetchPage: (cursor: string | null) => Promise<PageResult<T>>,
  onError: (e: unknown) => void,
) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const seq = useRef(0);

  /** Fetches a page (the first when `cursor` is null) into the list; no state is set before the response. */
  async function load(cursor: string | null) {
    const n = ++seq.current;
    try {
      const page = await fetchPage(cursor);
      if (n !== seq.current) return;
      setItems((prev) => {
        if (!cursor) return page.items;
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...page.items.filter((x) => !seen.has(x.id))];
      });
      setNextCursor(page.nextCursor);
      setLoaded(true);
    } catch (e) {
      if (n === seq.current) onError(e);
    }
  }

  async function loadMore() {
    setLoading(true);
    try {
      await load(nextCursor);
    } finally {
      setLoading(false);
    }
  }

  // Started from a promise callback: state is only ever set once a page arrives.
  useEffect(() => {
    if (enabled) void Promise.resolve(null).then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return {
    items,
    loaded,
    loading,
    more: nextCursor !== null,
    loadMore,
    reload: () => load(null),
    replace: (item: T) => setItems((prev) => prev.map((x) => (x.id === item.id ? item : x))),
    remove: (id: T["id"]) => setItems((prev) => prev.filter((x) => x.id !== id)),
  };
}
