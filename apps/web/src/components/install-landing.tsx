"use client";

import { useCallback, useEffect, useState } from "react";

import { BrandMark } from "@itqanak/ui";

import { BellIcon, CheckIcon, InstallIcon, ShieldCheckIcon } from "./icons";
import {
  installInstructionKind,
  isInAppBrowserUserAgent,
  isStandaloneApp,
} from "@/lib/pwa-install";

interface InstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

type Mode = "pending" | "ready" | "manual" | "ios" | "in-app" | "installed";

const copyByLocale = {
  ar: {
    dir: "rtl" as const,
    brand: "إتقانك",
    kicker: "بوابة الطالب — تطبيق",
    heading: "ثبّت بوابة الطالب على جهازك",
    sub: "تطبيق سريع بأيقونة على شاشتك الرئيسية، وإشعار فوري لكل رد من الفريق. بدون متجر تطبيقات.",
    installNow: "ثبّت بوابة الطالب الآن",
    install: "تثبيت التطبيق",
    installing: "جارٍ التثبيت…",
    openApp: "افتح بوابة الطالب",
    installedTitle: "التطبيق مثبّت على جهازك",
    manualHint: "أو افتح قائمة المتصفح (⋮) واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».",
    iosTitle: "لإضافة التطبيق على iPhone أو iPad",
    iosStep1: "اضغط زر المشاركة في شريط Safari.",
    iosStep2: "اختر «إضافة إلى الشاشة الرئيسية».",
    iosStep3: "اضغط «إضافة» — ستظهر الأيقونة على شاشتك.",
    inAppTitle: "أنت تتصفّح داخل تطبيق تواصل",
    inAppBody: "لا يمكن التثبيت المباشر من هنا. افتح هذا الرابط في متصفح الجهاز ثم اضغط «تثبيت».",
    inAppAndroid: "أندرويد: زر ⋮ في الأعلى ← «فتح في Chrome».",
    inAppIos: "آيفون: زر ••• ← «فتح في Safari».",
    copyLink: "نسخ الرابط",
    copied: "تم نسخ الرابط ✓",
    continueHere: "المتابعة في المتصفح الحالي بدون تثبيت",
    continuePlain: "المتابعة بدون تثبيت",
    whatIs: "ما هي إتقانك؟",
    benefits: [
      "أيقونة على شاشتك الرئيسية تفتحها مثل أي تطبيق",
      "إشعار فوري لكل رد أو تحديث على طلبك",
      "تثبيت مباشر وآمن — بدون متجر تطبيقات",
    ],
    platformsNote: "يعمل على أندرويد وiPhone والكمبيوتر.",
  },
  en: {
    dir: "ltr" as const,
    brand: "ITQANAK",
    kicker: "Student portal — app",
    heading: "Install the student portal on your device",
    sub: "A fast app with an icon on your home screen and an instant alert for every reply. No app store.",
    installNow: "Install the student portal now",
    install: "Install the app",
    installing: "Installing…",
    openApp: "Open the student portal",
    installedTitle: "The app is installed on your device",
    manualHint: "Or open your browser menu (⋮) and choose “Install app” or “Add to Home Screen”.",
    iosTitle: "To add the app on iPhone or iPad",
    iosStep1: "Tap the Share button in the Safari bar.",
    iosStep2: "Choose “Add to Home Screen”.",
    iosStep3: "Tap “Add” — the icon appears on your screen.",
    inAppTitle: "You are browsing inside a social app",
    inAppBody:
      "Direct install is not possible here. Open this link in your device browser, then tap “Install”.",
    inAppAndroid: "Android: the ⋮ button at the top → “Open in Chrome”.",
    inAppIos: "iPhone: the ••• button → “Open in Safari”.",
    copyLink: "Copy link",
    copied: "Link copied ✓",
    continueHere: "Continue in this browser without installing",
    continuePlain: "Continue without installing",
    whatIs: "What is ITQANAK?",
    benefits: [
      "A home-screen icon you open like any app",
      "An instant alert for every reply or update on your request",
      "Direct, safe install — no app store",
    ],
    platformsNote: "Works on Android, iPhone, and desktop.",
  },
} as const;

function ShareGlyph({ className }: { readonly className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3v11m0-11 3.5 3.5M12 3 8.5 6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M6 11H4.5v8.5h15V11H18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

const benefitIcons = [InstallIcon, BellIcon, ShieldCheckIcon] as const;

export function InstallLanding({ locale }: { readonly locale: "ar" | "en" }) {
  const copy = copyByLocale[locale];
  const portalHref = `/${locale}/student`;
  const [mode, setMode] = useState<Mode>("pending");
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent>();
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setShareUrl(`${window.location.origin}/${locale}/install`);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const standalone = isStandaloneApp(
      window.matchMedia("(display-mode: standalone)").matches,
      "standalone" in window.navigator ? window.navigator.standalone : false,
    );
    if (standalone) {
      setMode("installed");
    } else if (isInAppBrowserUserAgent(navigator.userAgent)) {
      setMode("in-app");
    } else if (
      installInstructionKind({
        maxTouchPoints: navigator.maxTouchPoints,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
      }) === "ios"
    ) {
      setMode("ios");
    } else {
      setMode("manual");
    }

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setMode((current) =>
        current === "installed" || current === "in-app" || current === "ios" ? current : "ready",
      );
    };
    const markInstalled = () => {
      setPromptEvent(undefined);
      setBusy(false);
      setMode("installed");
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, [locale]);

  const runInstall = useCallback(async () => {
    if (busy) return;
    if (promptEvent === undefined) {
      setMode((current) => (current === "ready" || current === "pending" ? "manual" : current));
      return;
    }
    setBusy(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setMode("installed");
      }
      setPromptEvent(undefined);
    } catch {
      setPromptEvent(undefined);
      setMode("manual");
    } finally {
      setBusy(false);
    }
  }, [busy, promptEvent]);

  const copyShare = useCallback(async () => {
    const value = shareUrl || `https://itqanqhelpstudent.online/${locale}/install`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }, [locale, shareUrl]);

  const primaryClass =
    "itq-sheen inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(120deg,var(--itq-color-brand-600),var(--itq-color-brand-800))] px-6 py-3 text-base font-black text-white shadow-[var(--itq-shadow-float)] transition hover:-translate-y-0.5 hover:shadow-[var(--itq-shadow-lg)] disabled:cursor-wait disabled:opacity-70";
  const secondaryLinkClass =
    "inline-flex min-h-11 items-center justify-center text-sm font-black text-[var(--itq-color-brand-strong)] underline-offset-4 hover:underline";

  return (
    <div
      className="grid min-h-[100svh] min-h-[100dvh] place-items-center bg-[var(--itq-color-canvas)] px-5 py-10 text-[var(--itq-color-ink)]"
      dir={copy.dir}
      lang={locale}
    >
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3">
          <BrandMark className="size-11" label={copy.brand} />
          <span className="text-lg font-black">{copy.brand}</span>
        </div>

        <div className="mt-6 overflow-hidden rounded-[1.9rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] shadow-[var(--itq-shadow-card)]">
          <div
            aria-hidden="true"
            className="h-1.5 bg-[linear-gradient(90deg,var(--itq-color-brand-500),color-mix(in_srgb,var(--itq-color-accent-500)_75%,transparent))]"
          />
          <div className="p-6 sm:p-8">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] px-3 py-1 text-[0.7rem] font-black uppercase tracking-[0.08em] text-[var(--itq-color-brand-strong)]">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-[var(--itq-color-brand-strong)]"
              />
              {copy.kicker}
            </p>
            <h1 className="mt-4 text-[1.9rem] font-black leading-[1.15] tracking-[-0.02em] sm:text-[2.35rem]">
              {mode === "installed" ? copy.installedTitle : copy.heading}
            </h1>
            <p className="mt-3 leading-8 text-[var(--itq-color-muted)]">{copy.sub}</p>

            <div className="mt-7">
              {mode === "installed" ? (
                <a className={primaryClass} href={portalHref}>
                  <InstallIcon className="size-5" />
                  {copy.openApp}
                </a>
              ) : mode === "ios" ? (
                <div className="rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-5">
                  <p className="flex items-center gap-2 font-black">
                    <ShareGlyph className="size-5 text-[var(--itq-color-brand-strong)]" />
                    {copy.iosTitle}
                  </p>
                  <ol className="mt-3 grid gap-2.5 text-sm leading-7 text-[var(--itq-color-ink-soft)]">
                    {[copy.iosStep1, copy.iosStep2, copy.iosStep3].map((step, index) => (
                      <li className="flex gap-3" key={step}>
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--itq-color-brand-700)] text-xs font-black text-white">
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : mode === "in-app" ? (
                <div className="rounded-2xl border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] p-5 text-[var(--itq-color-warning-950)]">
                  <p className="font-black">{copy.inAppTitle}</p>
                  <p className="mt-2 text-sm leading-7">{copy.inAppBody}</p>
                  <div className="mt-4 flex flex-col gap-2 rounded-xl border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-surface)] p-2 sm:flex-row">
                    <input
                      aria-label={copy.copyLink}
                      className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-2 text-xs font-bold text-[var(--itq-color-ink-soft)] outline-none"
                      dir="ltr"
                      readOnly
                      value={shareUrl}
                    />
                    <button
                      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--itq-color-brand-700)] px-4 text-xs font-black text-white transition hover:bg-[var(--itq-color-brand-800)]"
                      onClick={() => void copyShare()}
                      type="button"
                    >
                      {copied ? <CheckIcon className="size-4" /> : null}
                      {copied ? copy.copied : copy.copyLink}
                    </button>
                  </div>
                  <ul className="mt-3 grid gap-1 text-xs font-semibold leading-6">
                    <li>{copy.inAppAndroid}</li>
                    <li>{copy.inAppIos}</li>
                  </ul>
                </div>
              ) : (
                <button
                  aria-busy={busy}
                  className={primaryClass}
                  disabled={busy}
                  onClick={() => void runInstall()}
                  type="button"
                >
                  <InstallIcon className="size-5" />
                  {busy ? copy.installing : mode === "ready" ? copy.installNow : copy.install}
                </button>
              )}

              {mode === "manual" ? (
                <p className="mt-3 text-sm leading-7 text-[var(--itq-color-muted)]">
                  {copy.manualHint}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--itq-color-border)] pt-5">
              <a className={secondaryLinkClass} href={portalHref}>
                {mode === "in-app" ? copy.continueHere : copy.continuePlain}
              </a>
              <a
                className="inline-flex items-center gap-1 text-sm font-bold text-[var(--itq-color-muted)] hover:text-[var(--itq-color-brand-strong)]"
                href={`/${locale}`}
              >
                {copy.whatIs}
              </a>
            </div>
          </div>
        </div>

        <ul className="mt-6 grid gap-3">
          {copy.benefits.map((benefit, index) => {
            const Icon = benefitIcons[index] ?? InstallIcon;
            return (
              <li
                className="flex items-start gap-3 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4"
                key={benefit}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-bold leading-7">{benefit}</span>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 text-center text-xs font-semibold text-[var(--itq-color-muted)]">
          {copy.platformsNote}
        </p>
      </div>
    </div>
  );
}
