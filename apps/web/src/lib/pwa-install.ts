export interface InstallClientDescriptor {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints: number;
}

export type InstallInstructionKind = "ios" | "browser";

export function isStandaloneApp(
  displayModeStandalone: boolean,
  navigatorStandalone: unknown,
): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

export function installInstructionKind({
  maxTouchPoints,
  platform,
  userAgent,
}: InstallClientDescriptor): InstallInstructionKind {
  const classicAppleMobile = /iPad|iPhone|iPod/u.test(userAgent);
  const iPadDesktopUserAgent = platform === "MacIntel" && maxTouchPoints > 1;
  return classicAppleMobile || iPadDesktopUserAgent ? "ios" : "browser";
}

// Social apps open shared links inside an embedded web view where a PWA can
// never be installed. When we detect one we stop offering an install button
// that cannot work and tell the visitor to reopen the link in the real browser.
const IN_APP_BROWSER_MARKERS: readonly string[] = [
  "FBAN",
  "FBAV",
  "FB_IAB",
  "Instagram",
  "Line/",
  "Twitter",
  "musical_ly",
  "TikTok",
  "Snapchat",
  "Snapchat/",
  "Pinterest",
  "WhatsApp",
  "GSA/",
  "OKApp",
  "MicroMessenger",
];

export function isInAppBrowserUserAgent(userAgent: string): boolean {
  if (userAgent.includes("wv)")) {
    return true;
  }
  return IN_APP_BROWSER_MARKERS.some((marker) => userAgent.includes(marker));
}
