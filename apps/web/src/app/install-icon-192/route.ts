import { createElement } from "react";

import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function GET(): ImageResponse {
  const mark = createElement(
    "svg",
    { fill: "none", height: 128, viewBox: "0 0 32 32", width: 128 },
    createElement("path", {
      d: "M8.5 15.5c0-4.9 3-8 7.5-8s7.5 3.1 7.5 8v8.25",
      stroke: "white",
      strokeLinecap: "round",
      strokeWidth: 2.6,
    }),
    createElement("path", {
      d: "m10.3 20.1 4.1 4.1 8.5-9",
      stroke: "#f2d69c",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 3,
    }),
    createElement("path", {
      d: "M13 4.1h6",
      stroke: "#f2d69c",
      strokeLinecap: "round",
      strokeWidth: 2.4,
    }),
  );
  return new ImageResponse(
    createElement(
      "div",
      {
        style: {
          alignItems: "center",
          background: "linear-gradient(145deg, #0f7540 0%, #00522a 68%, #002c17 100%)",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        },
      },
      mark,
    ),
    {
      height: 192,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
      width: 192,
    },
  );
}
