"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "itq-chat-wallpaper";

export const chatWallpapers = [
  { id: "brand", labelAr: "زخرفة إتقانك", labelEn: "ITQANAK motif" },
  { id: "plain", labelAr: "هادئ", labelEn: "Plain" },
  { id: "dots", labelAr: "نقاط", labelEn: "Dots" },
] as const;

export type ChatWallpaperId = (typeof chatWallpapers)[number]["id"];

function isWallpaperId(value: string | null): value is ChatWallpaperId {
  return value !== null && chatWallpapers.some((wallpaper) => wallpaper.id === value);
}

/**
 * Per-viewer chat wallpaper, remembered in localStorage only (nothing leaves
 * the device). The value is applied as `data-wallpaper` on the chat surface;
 * "brand" is the default institutional backdrop and needs no attribute.
 */
export function useChatWallpaper(): {
  readonly wallpaper: ChatWallpaperId;
  readonly cycle: () => ChatWallpaperId;
  readonly setWallpaper: (id: ChatWallpaperId) => void;
} {
  const [wallpaper, setWallpaperState] = useState<ChatWallpaperId>("brand");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isWallpaperId(saved)) setWallpaperState(saved);
    } catch {
      // Private windows / blocked storage — the default stands.
    }
  }, []);

  const setWallpaper = useCallback((id: ChatWallpaperId) => {
    setWallpaperState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Non-fatal — it just won't persist across reloads.
    }
  }, []);

  const cycle = useCallback((): ChatWallpaperId => {
    const index = chatWallpapers.findIndex((entry) => entry.id === wallpaper);
    const next = chatWallpapers[(index + 1) % chatWallpapers.length]?.id ?? "brand";
    setWallpaper(next);
    return next;
  }, [wallpaper, setWallpaper]);

  return { wallpaper, cycle, setWallpaper };
}

export function chatWallpaperLabel(id: ChatWallpaperId, english: boolean): string {
  const entry = chatWallpapers.find((wallpaper) => wallpaper.id === id);
  if (entry === undefined) return id;
  return english ? entry.labelEn : entry.labelAr;
}
