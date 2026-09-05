"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { ArrowIcon, ChevronIcon, CloseIcon } from "./icons";

export interface LightboxImage {
  readonly src: string;
  readonly download: string;
  readonly name: string;
}

/**
 * Full-screen image viewer with a gallery when more than one image is passed:
 * on-screen arrows, ArrowLeft/ArrowRight, and swipe (when not zoomed).
 * Double-tap / double-click toggles a 2.5x zoom you can drag to pan. Swipe
 * direction is content-relative (drag left = next), the same in both
 * text directions, since it is a gesture on the picture, not on prose.
 */
export function ImageLightbox({
  images,
  initialIndex,
  locale,
  onClose,
}: Readonly<{
  images: readonly LightboxImage[];
  initialIndex: number;
  locale: "ar" | "en";
  onClose: () => void;
}>) {
  const english = locale === "en";
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0)),
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  const many = images.length > 1;
  const current = images[index];

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const go = useCallback(
    (delta: number) => {
      setIndex((value) => {
        const next = value + delta;
        return next < 0 || next >= images.length ? value : next;
      });
      resetView();
    },
    [images.length, resetView],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (current === undefined) return null;

  const toggleZoom = () => {
    if (zoom > 1) resetView();
    else setZoom(2.5);
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (zoom > 1) {
      dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    } else if (many) {
      swipeRef.current = { x: event.clientX, y: event.clientY };
    }
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (drag === null) return;
    setPan({ x: drag.panX + (event.clientX - drag.x), y: drag.panY + (event.clientY - drag.y) });
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    dragRef.current = null;
    const swipe = swipeRef.current;
    swipeRef.current = null;
    if (swipe !== null && zoom === 1) {
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    }
  };

  return (
    <div
      aria-label={english ? "Image preview" : "معاينة الصورة"}
      aria-modal="true"
      className="fixed inset-0 z-[130] flex flex-col bg-black/95"
      role="dialog"
    >
      <div className="flex items-center justify-between gap-3 p-3 text-white">
        <bdi className="min-w-0 truncate text-sm font-bold" dir="auto">
          {current.name}
          {many ? ` · ${index + 1}/${images.length}` : ""}
        </bdi>
        <div className="flex shrink-0 items-center gap-1">
          <a
            aria-label={english ? "Download" : "تنزيل"}
            className="grid size-10 place-items-center rounded-full hover:bg-white/10"
            href={current.download}
          >
            <ArrowIcon className="size-5 rotate-90" />
          </a>
          <button
            aria-label={english ? "Close" : "إغلاق"}
            className="grid size-10 place-items-center rounded-full hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
      </div>
      <div
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-2"
        onClick={(event) => {
          if (event.target === event.currentTarget && zoom === 1) onClose();
        }}
        onDoubleClick={toggleZoom}
        onPointerCancel={() => {
          dragRef.current = null;
          swipeRef.current = null;
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          alt={current.name}
          className="max-h-full max-w-full select-none object-contain transition-transform duration-150"
          draggable={false}
          src={current.src}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            cursor: zoom > 1 ? "grab" : "zoom-in",
          }}
        />
        {many ? (
          <>
            <button
              aria-label={english ? "Previous" : "السابق"}
              className="absolute start-2 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-25"
              disabled={index === 0}
              onClick={() => go(-1)}
              type="button"
            >
              <ChevronIcon className="size-6 -rotate-90 rtl:rotate-90" />
            </button>
            <button
              aria-label={english ? "Next" : "التالي"}
              className="absolute end-2 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-25"
              disabled={index === images.length - 1}
              onClick={() => go(1)}
              type="button"
            >
              <ChevronIcon className="size-6 rotate-90 rtl:-rotate-90" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
