import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(145deg, #0b5f59 0%, #073f3c 68%, #102a2e 100%)",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <svg fill="none" height="340" viewBox="0 0 32 32" width="340">
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
      </div>
    ),
    size,
  );
}
