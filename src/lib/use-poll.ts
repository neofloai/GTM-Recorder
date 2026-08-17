"use client";

import { useEffect, useRef, useState } from "react";

type Options<T> = {
  /** Poll again while this returns true. Returning false stops the timer. */
  keepPolling: (value: T) => boolean;
  intervalMs?: number;
};

/**
 * Fetches once, then re-fetches on an interval for as long as `keepPolling` says
 * the value is still changing. Replaces Firestore's onSnapshot now that the
 * browser talks to API routes rather than to Firestore directly.
 */
export function usePoll<T>(
  fetcher: () => Promise<T>,
  { keepPolling, intervalMs = 2000 }: Options<T>,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the latest callbacks without making them retrigger the effect.
  const fetcherRef = useRef(fetcher);
  const keepRef = useRef(keepPolling);
  fetcherRef.current = fetcher;
  keepRef.current = keepPolling;

  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const value = await fetcherRef.current();
        if (cancelled) return;
        setData(value);
        setError(null);
        if (keepRef.current(value)) timer = setTimeout(tick, intervalMs);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, nonce, ...deps]);

  return { data, error, loading, refresh, setData };
}
