import type { JSX } from "react";

import { classNames } from "@itqanak/ui";

export type MarketingIconName =
  | "check"
  | "code"
  | "compass"
  | "document"
  | "files"
  | "headphones"
  | "lock"
  | "message"
  | "palette"
  | "route"
  | "shield"
  | "sparkles"
  | "training"
  | "translate";

interface MarketingIconProps {
  readonly name: MarketingIconName;
  readonly className?: string;
}

function IconPath({ name }: Readonly<{ name: MarketingIconName }>): JSX.Element {
  switch (name) {
    case "check":
      return <path d="m6 12 4 4 8-9" />;
    case "code":
      return <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M14 4l-4 16" />;
    case "compass":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" />
        </>
      );
    case "document":
      return (
        <>
          <path d="M7 3.5h7l4 4V20H7z" />
          <path d="M14 3.5v4h4M10 12h5M10 15.5h5" />
        </>
      );
    case "files":
      return (
        <>
          <path d="M8 7.5h9.5A1.5 1.5 0 0 1 19 9v9.5H9.5A1.5 1.5 0 0 1 8 17z" />
          <path d="M8 16H5V5.5h10V8" />
        </>
      );
    case "headphones":
      return (
        <>
          <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
          <path d="M4 13.5A2.5 2.5 0 0 1 6.5 11H8v7H6.5A2.5 2.5 0 0 1 4 15.5zM20 13.5a2.5 2.5 0 0 0-2.5-2.5H16v7h1.5a2.5 2.5 0 0 0 2.5-2.5z" />
        </>
      );
    case "lock":
      return (
        <>
          <rect height="9" rx="2" width="14" x="5" y="11" />
          <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v1.5" />
        </>
      );
    case "message":
      return (
        <>
          <path d="M4 5.5h16v11H9l-5 4z" />
          <path d="M8 10h8M8 13h5" />
        </>
      );
    case "palette":
      return (
        <>
          <path d="M12 3.5a8.5 8.5 0 1 0 0 17h1.2a1.8 1.8 0 0 0 1.3-3c-.7-.8-.1-2 1-2H17a3.5 3.5 0 0 0 3.5-3.5A8.5 8.5 0 0 0 12 3.5Z" />
          <path d="M8 9h.01M11.5 6.8h.01M15.5 8h.01M7.5 13h.01" />
        </>
      );
    case "route":
      return (
        <>
          <circle cx="6" cy="17.5" r="2" />
          <circle cx="18" cy="6.5" r="2" />
          <path d="M8 17.5h2a2 2 0 0 0 2-2v-7a2 2 0 0 1 2-2h2" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M12 3.5 19 6v5.2c0 4.1-2.8 7.5-7 9.3-4.2-1.8-7-5.2-7-9.3V6z" />
          <path d="m8.5 12 2.2 2.2 4.8-5" />
        </>
      );
    case "sparkles":
      return (
        <>
          <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7zM6 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
        </>
      );
    case "training":
      return (
        <>
          <path d="m3.5 9 8.5-4.5L20.5 9 12 13.5z" />
          <path d="M7 11v4.5c2.6 2 7.4 2 10 0V11M20.5 9v6" />
        </>
      );
    case "translate":
      return (
        <>
          <path d="M4 5h9M8.5 3v2M6 8c1 3 3.2 5.2 6 6.5M12 8c-1 3.2-3.6 6-7 7.5" />
          <path d="m14 20 3.2-8 3.3 8M15.2 17h4" />
        </>
      );
  }
}

export function MarketingIcon({ name, className }: MarketingIconProps): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={classNames("size-6", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <IconPath name={name} />
    </svg>
  );
}
