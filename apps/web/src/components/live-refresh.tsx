"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered page's data fresh: re-runs the route (via
 * `router.refresh()`) when the tab regains focus and on a slow interval while
 * it is visible. Used on the admin overview so the unread / unpaid / pending
 * counts fall in step as the admin works elsewhere.
 */
export function LiveRefresh({ intervalMs = 30_000 }: Readonly<{ intervalMs?: number }>) {
  const router = useRouter();
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, Math.max(10_000, intervalMs));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      }
    };
    start();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, router]);
  return null;
}
