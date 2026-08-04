"use client";

import { useEffect, useState } from "react";

/**
 * A clock that re-renders on an interval.
 *
 * Starts as null and fills in after mount. Rendering a live time during server
 * rendering guarantees a hydration mismatch, because the server's clock and the
 * browser's are never the same millisecond - and React resolves that by
 * discarding and re-rendering the subtree, which is both slow and visible.
 */
export function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
