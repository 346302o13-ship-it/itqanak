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
