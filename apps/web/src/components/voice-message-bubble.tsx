"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * A WhatsApp-style voice-note player around a plain <audio>: play/pause, a
 * scrubbable progress track, an elapsed / total readout, and a 1x/1.5x/2x
 * speed toggle. No decoded waveform yet — the bars are a static motif (see
 * chat-audit backlog). Client-only: it reads duration from the element, so
 * there is no server or DB change.
 */
const SPEEDS = [1, 1.5, 2] as const;
const BARS = 34;

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VoiceMessageBubble({
  src,
  download,
  filename,
  locale,
}: Readonly<{
  src: string;
  download: string;
  filename: string;
  locale: "ar" | "en";
}>) {
  const english = locale === "en";
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);

  // webm/opus recordings often report `duration = Infinity` until the element
  // has seeked once; nudge it to the end and read the corrected value.
  const resolveDuration = useCallback(() => {
    const audio = audioRef.current;
    if (audio === null) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
      return;
    }
    const onFixed = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        audio.currentTime = 0;
        audio.removeEventListener("durationchange", onFixed);
      }
    };
    audio.addEventListener("durationchange", onFixed);
    try {
      audio.currentTime = 1e101;
    } catch {
      // Some engines reject the seek — leave duration at 0, the UI copes.
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null) return undefined;
    const onTime = () => setCurrent(audio.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("loadedmetadata", resolveDuration);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("loadedmetadata", resolveDuration);
    };
  }, [resolveDuration]);

  const toggle = () => {
    const audio = audioRef.current;
    if (audio === null) return;
    if (audio.paused) {
      void audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    if (audioRef.current !== null) audioRef.current.playbackRate = SPEEDS[next] ?? 1;
  };

  const seekFromPointer = (clientX: number) => {
    const track = trackRef.current;
    const audio = audioRef.current;
    if (track === null || audio === null || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    let ratio = (clientX - rect.left) / rect.width;
    if (english === false) ratio = 1 - ratio;
    ratio = Math.min(1, Math.max(0, ratio));
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };
  const onTrackPointerDown = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event.clientX);
  };
  const onTrackPointerMove = (event: ReactPointerEvent) => {
    if (event.buttons === 1) seekFromPointer(event.clientX);
  };

  const progress = duration > 0 ? current / duration : 0;

  return (
    <div className="flex min-w-[13rem] max-w-full items-center gap-2.5">
      <audio className="hidden" preload="metadata" ref={audioRef} src={src}>
        <a href={download}>{english ? "Download voice message" : "تنزيل الرسالة الصوتية"}</a>
      </audio>
      <button
        aria-label={playing ? (english ? "Pause" : "إيقاف") : english ? "Play" : "تشغيل"}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--itq-color-brand-700)] text-white"
        onClick={toggle}
        type="button"
      >
        {playing ? (
          <span className="flex gap-[3px]">
            <span className="block h-3.5 w-1 rounded-sm bg-current" />
            <span className="block h-3.5 w-1 rounded-sm bg-current" />
          </span>
        ) : (
          <span className="ms-0.5 block border-y-[6px] border-s-[10px] border-y-transparent border-s-current rtl:me-0.5 rtl:ms-0 rtl:rotate-180" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className="flex h-8 cursor-pointer items-center gap-[2px]"
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          ref={trackRef}
        >
          {Array.from({ length: BARS }).map((_, index) => {
            const filled = index / BARS <= progress;
            const height = 22 + Math.round(14 * Math.abs(Math.sin(index * 1.7)));
            return (
              <span
                className={`w-[3px] shrink-0 rounded-full ${
                  filled
                    ? "bg-[var(--itq-color-brand-600)]"
                    : "bg-[var(--itq-color-bubble-meta)]/45"
                }`}
                key={index}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] font-bold text-[var(--itq-color-bubble-meta)]">
          <bdi className="truncate" dir="auto">
            {filename}
          </bdi>
          <span className="shrink-0 tabular-nums">
            {formatClock(playing || current > 0 ? current : duration)}
            {duration > 0 ? ` / ${formatClock(duration)}` : ""}
          </span>
        </div>
      </div>
      <button
        aria-label={english ? "Playback speed" : "سرعة التشغيل"}
        className="shrink-0 rounded-full border border-[var(--itq-color-border)] px-1.5 py-0.5 text-[10px] font-black text-[var(--itq-color-bubble-meta)]"
        onClick={cycleSpeed}
        type="button"
      >
        {SPEEDS[speedIndex]}x
      </button>
    </div>
  );
}
