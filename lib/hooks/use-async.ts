"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "success"; data: T };

interface Snapshot<T> {
  key: string;
  tick: number;
  state: Exclude<AsyncState<T>, { status: "loading" }>;
}

/**
 * Module-level result cache: pages unmount on route changes, but their last
 * data survives here, so navigating back renders instantly and revalidates
 * silently in the background. Cleared on sign-out.
 */
const swrCache = new Map<string, unknown>();

export function clearAsyncCache(): void {
  swrCache.clear();
}

/**
 * Fill the SWR cache ahead of navigation (e.g. on folder-row hover) so the
 * next useAsync mount renders instantly. In-flight keys are deduped.
 */
const prefetchPending = new Set<string>();
export function prefetchAsync<T>(key: string, load: () => Promise<T>): void {
  if (swrCache.has(key) || prefetchPending.has(key)) return;
  prefetchPending.add(key);
  load()
    .then((data) => {
      if (!swrCache.has(key)) swrCache.set(key, data);
    })
    .catch(() => undefined)
    .finally(() => prefetchPending.delete(key));
}

/**
 * Revalidate-on-focus: every mounted hook re-runs its loader when the tab
 * becomes visible again or the connection returns, so a list left open in
 * a second window never goes stale. Throttled so window-juggling doesn't
 * hammer the backend; stale-while-revalidate keeps the UI from flashing.
 */
const reloaders = new Set<() => void>();
let lastRevalidate = 0;
function revalidateAll(): void {
  const now = Date.now();
  if (now - lastRevalidate < 3000) return;
  lastRevalidate = now;
  reloaders.forEach((reload) => reload());
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") revalidateAll();
  });
  window.addEventListener("focus", revalidateAll);
  window.addEventListener("online", revalidateAll);
}

/**
 * Minimal data-loading primitive over the async storage adapter, with
 * stale-while-revalidate built in.
 *
 * - `key` identifies the request: the loader re-runs whenever it changes
 *   (e.g. the current folder id). `reload()` re-runs it explicitly.
 * - While a NEW key resolves, the previous key's successful data keeps
 *   rendering (flagged `isStale`) instead of flashing a skeleton — this is
 *   what makes folder navigation feel instant. A snapshot for an older
 *   request can never overwrite a newer one (key/tick tagging).
 * - `setData` patches loaded data in place — the hook for optimistic updates.
 */
export function useAsync<T>(load: () => Promise<T>, key: string) {
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(() =>
    swrCache.has(key)
      ? {
          key,
          tick: 0,
          state: { status: "success", data: swrCache.get(key) as T },
        }
      : null,
  );
  const [tick, setTick] = useState(0);
  // Bumped by every APPLIED setData patch. A load whose response comes back
  // after a manual write is stale by definition (its SELECT left before the
  // write committed) — on a slow network it would clobber the patch: create
  // a room while the initial list is still in flight and the card vanishes.
  // key/tick tagging can't catch this; the write generation does.
  const writeGenRef = useRef(0);

  // Keep the latest loader without re-running the effect on identity changes.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    const startGen = writeGenRef.current;
    loadRef.current().then(
      (data) => {
        if (writeGenRef.current !== startGen) return; // stale vs a manual write
        swrCache.set(key, data);
        if (!cancelled)
          setSnapshot({ key, tick, state: { status: "success", data } });
      },
      (error: unknown) => {
        if (writeGenRef.current !== startGen) return;
        if (!cancelled)
          setSnapshot({ key, tick, state: { status: "error", error } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  const fresh =
    snapshot !== null && snapshot.key === key && snapshot.tick === tick;
  const state: AsyncState<T> = fresh
    ? snapshot.state
    : snapshot && snapshot.state.status === "success"
      ? snapshot.state // stale-while-revalidate: keep last good content
      : { status: "loading" };
  const isStale = !fresh && state.status === "success";

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    reloaders.add(reload);
    return () => {
      reloaders.delete(reload);
    };
  }, [reload]);

  const setData = useCallback((updater: (prev: T) => T) => {
    setSnapshot((prev) => {
      if (!prev || prev.state.status !== "success") return prev;
      writeGenRef.current += 1;
      const data = updater(prev.state.data);
      swrCache.set(prev.key, data);
      return { ...prev, state: { status: "success", data } };
    });
  }, []);

  return { state, isStale, reload, setData };
}
