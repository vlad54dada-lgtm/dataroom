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
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null);
  const [tick, setTick] = useState(0);

  // Keep the latest loader without re-running the effect on identity changes.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef.current().then(
      (data) => {
        if (!cancelled)
          setSnapshot({ key, tick, state: { status: "success", data } });
      },
      (error: unknown) => {
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

  const setData = useCallback((updater: (prev: T) => T) => {
    setSnapshot((prev) =>
      prev && prev.state.status === "success"
        ? {
            ...prev,
            state: { status: "success", data: updater(prev.state.data) },
          }
        : prev,
    );
  }, []);

  return { state, isStale, reload, setData };
}
