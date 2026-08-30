"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { InstallIcon } from "./icons";
import { installInstructionKind, isStandaloneApp } from "@/lib/pwa-install";

interface InstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

type AppSurface = "public" | "student" | "admin";

const labels = {
  ar: {
    public: "تثبيت المنصة",
    student: "تثبيت بوابة الطالب",
    admin: "تثبيت مركز الإدارة",
    installed: "التطبيق مثبت",
    title: "تثبيت إتقانك كتطبيق ويب",
    ios: "على iPhone أو iPad: افتح زر المشاركة في Safari، ثم اختر «إضافة إلى الشاشة الرئيسية».",
    fallback:
      "افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». لا يحتاج التطبيق إلى متجر.",
    close: "حسناً",
  },
  en: {
    public: "Install ITQANAK",
    student: "Install student portal",
    admin: "Install admin center",
    installed: "App installed",
    title: "Install ITQANAK as a web app",
    ios: "On iPhone or iPad: open Safari Share, then choose “Add to Home Screen”.",
    fallback:
      "Open your browser menu and choose “Install app” or “Add to Home Screen”. No app store is needed.",
    close: "Got it",
  },
} as const;

interface InstallAppButtonProps {
  readonly locale?: "ar" | "en";
  readonly surface?: AppSurface;
  readonly compact?: boolean;
  readonly className?: string;
  /**
   * "inline" (default) is the small pill used in headers.
   * "fab" is the floating round pill; it renders nothing once the app is
   * installed / running standalone, or on a browser that offers no install path.
   */
  readonly variant?: "inline" | "fab";
}

function isStandalone(): boolean {
  return isStandaloneApp(
    window.matchMedia("(display-mode: standalone)").matches,
    "standalone" in window.navigator ? window.navigator.standalone : false,
  );
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function InstallAppButton({
  className = "",
  compact = false,
  locale = "ar",
  surface = "public",
  variant = "inline",
}: InstallAppButtonProps) {
  const copy = labels[locale];
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent>();
  const [installed, setInstalled] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);
  const dialogId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setInstalled(isStandalone());
    setIosDevice(
      installInstructionKind({
        maxTouchPoints: navigator.maxTouchPoints,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
      }) === "ios",
    );
    // Register the notification/installability service worker as early as
    // possible: Android needs an active worker with a fetch handler to mint a
    // real installed app (a WebAPK) rather than a shortcut that disappears.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setPromptEvent(undefined);
      setPrompting(false);
      setInstructions(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    if (!instructions) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [instructions]);

  function closeInstructions() {
    setInstructions(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeInstructions();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function install() {
    if (installed || prompting) return;
    if (promptEvent === undefined) {
      setInstructions(true);
      return;
    }
    setPrompting(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(undefined);
    } catch {
      setPromptEvent(undefined);
      setInstructions(true);
    } finally {
      setPrompting(false);
    }
  }

  // The floating variant is an offer, not a status line: once there is nothing
  // to offer (already installed / standalone / a browser with no install path)
  // it disappears entirely.
  if (variant === "fab" && (installed || !(promptEvent !== undefined || iosDevice))) {
    return null;
  }

  const label = installed ? copy.installed : copy[surface];
  const interactionClass = prompting
    ? "cursor-wait opacity-70"
    : installed
      ? "cursor-default opacity-70"
      : "hover:-translate-y-0.5 hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)]";
  const baseClass =
    variant === "fab"
      ? "inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-white/25 bg-[var(--itq-color-surface)] px-4 text-sm font-black text-[var(--itq-color-brand-strong)] shadow-[var(--itq-shadow-float)] transition"
      : "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 text-xs font-black text-[var(--itq-color-brand-strong)] shadow-sm transition";
  return (
    <>
      <button
        aria-busy={prompting}
        aria-controls={instructions ? dialogId : undefined}
        aria-disabled={installed || prompting}
        aria-haspopup="dialog"
        aria-label={label}
        className={`${baseClass} ${interactionClass} ${className}`}
        disabled={prompting}
        onClick={() => void install()}
        ref={triggerRef}
        type="button"
      >
        <InstallIcon className={variant === "fab" ? "size-5" : "size-4.5"} />
        <span
          aria-live="polite"
          className={compact && variant !== "fab" ? "sr-only sm:not-sr-only" : undefined}
        >
          {label}
        </span>
      </button>

      {instructions ? (
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="fixed inset-0 z-[120] grid place-items-center bg-[var(--itq-color-ink)]/55 p-4 backdrop-blur-sm"
          id={dialogId}
          onKeyDown={handleDialogKeyDown}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeInstructions();
          }}
          role="dialog"
        >
          <div
            className="w-full max-w-md rounded-[1.75rem] border border-white/70 bg-[var(--itq-color-surface)] p-6 text-start shadow-[var(--itq-shadow-float)] outline-none sm:p-7"
            ref={dialogRef}
            tabIndex={-1}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
              <InstallIcon className="size-6" />
            </span>
            <h2 className="mt-4 text-xl font-black" id={titleId}>
              {copy.title}
            </h2>
            <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">
              {installInstructionKind({
                maxTouchPoints: navigator.maxTouchPoints,
                platform: navigator.platform,
                userAgent: navigator.userAgent,
              }) === "ios"
                ? copy.ios
                : copy.fallback}
            </p>
            <button
              className="mt-6 min-h-11 w-full rounded-xl bg-[var(--itq-color-brand-700)] px-5 font-black text-white transition hover:bg-[var(--itq-color-brand-800)]"
              onClick={closeInstructions}
              ref={closeButtonRef}
              type="button"
            >
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
