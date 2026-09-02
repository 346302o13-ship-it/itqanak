import { ImageResponse } from "next/og";

// Shared art for the /ar/install and /en/install Open Graph / Twitter cards so
// a pasted link renders as a branded advert on WhatsApp, X, Telegram, etc.
// Deliberately Latin-only text: ImageResponse ships no Arabic-capable font and
// the localized wording already lives in each page's og:title / og:description.

export const installOgAlt = "ITQANAK — install the student portal app";
export const installOgSize = { width: 1200, height: 630 };
export const installOgContentType = "image/png";

export function renderInstallOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(145deg, #0b5f59 0%, #073f3c 68%, #102a2e 100%)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: "72px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "linear-gradient(90deg, #2ec5b6, rgba(242, 214, 156, 0.65))",
            height: "12px",
            left: 0,
            position: "absolute",
            top: 0,
            width: "100%",
          }}
        />
        <div style={{ alignItems: "center", display: "flex", gap: "28px" }}>
          <svg fill="none" height="132" viewBox="0 0 32 32" width="132">
            <path
              d="M8.5 15.5c0-4.9 3-8 7.5-8s7.5 3.1 7.5 8v8.25"
              stroke="white"
              strokeLinecap="round"
              strokeWidth="2.6"
            />
            <path
              d="m10.3 20.1 4.1 4.1 8.5-9"
              stroke="#f2d69c"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            <path d="M13 4.1h6" stroke="#f2d69c" strokeLinecap="round" strokeWidth="2.4" />
          </svg>
          <div style={{ fontSize: "104px", fontWeight: 800, letterSpacing: "-3px" }}>ITQANAK</div>
        </div>
        <div style={{ color: "#cfe6e2", fontSize: "40px", fontWeight: 700, marginTop: "34px" }}>
          Student Portal — install the app
        </div>
        <div
          style={{
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.12)",
            border: "1px solid rgba(255, 255, 255, 0.25)",
            borderRadius: "999px",
            display: "flex",
            fontSize: "30px",
            fontWeight: 700,
            marginTop: "40px",
            padding: "18px 38px",
          }}
        >
          Add it to your home screen — no app store
        </div>
        <div
          style={{
            bottom: "56px",
            color: "#9ec7c2",
            fontSize: "28px",
            fontWeight: 700,
            position: "absolute",
          }}
        >
          itqanqhelpstudent.online
        </div>
      </div>
    ),
    installOgSize,
  );
}
