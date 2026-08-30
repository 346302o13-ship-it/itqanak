import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The VAPID public key the browser needs to create a push subscription. */
export function GET(): NextResponse {
  const publicKey = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
  const subject = (process.env.WEB_PUSH_SUBJECT ?? "").trim();
  const enabled =
    publicKey.length >= 80 && (subject.startsWith("mailto:") || subject.startsWith("https://"));
  return NextResponse.json(
    { enabled, publicKey: enabled ? publicKey : null },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
