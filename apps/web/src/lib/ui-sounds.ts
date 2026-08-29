// Short synthesized cues for chat and notifications — WhatsApp-style "tick" on
// send and a two-note chime on receive. Sounds are on unless the viewer has
// explicitly turned them off; the single toggle in the notification centre
// writes this key.

export const soundPreferenceKey = "itqanak.notifications.sound.v1";

/** On by default; only an explicit "disabled" mutes. */
export function soundEnabled(value: string | null): boolean {
  return value !== "disabled";
}

export type UiSoundKind = "send" | "receive" | "notify";

type ToneStep = readonly [offsetSeconds: number, frequency: number];

const patterns: Readonly<Record<UiSoundKind, readonly ToneStep[]>> = {
  send: [
    [0, 620],
    [0.08, 960],
  ],
  receive: [
    [0, 880],
    [0.14, 1_180],
  ],
  notify: [
    [0, 880],
    [0.15, 1_080],
  ],
};

let sharedContext: AudioContext | undefined;

function audioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/**
 * Play one cue. No-ops silently when muted, when Web Audio is unavailable, or
 * when the audio context cannot be resumed (e.g. before any user gesture).
 */
export function playUiSound(kind: UiSoundKind): void {
  if (typeof window === "undefined") return;
  try {
    if (!soundEnabled(window.localStorage.getItem(soundPreferenceKey))) return;
  } catch {
    // Storage blocked (private mode) — treat as enabled.
  }
  const Ctor = audioContextConstructor();
  if (Ctor === undefined) return;
  try {
    const context = sharedContext ?? new Ctor();
    sharedContext = context;
    void context
      .resume()
      .then(() => {
        const now = context.currentTime;
        const peak = kind === "send" ? 0.05 : 0.1;
        for (const [offset, frequency] of patterns[kind]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, now + offset);
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(peak, now + offset + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.12);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(now + offset);
          oscillator.stop(now + offset + 0.13);
        }
      })
      .catch(() => undefined);
  } catch {
    // Audio is progressive enhancement; callers never depend on it.
  }
}
