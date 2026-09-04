import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.8,
};

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" />
      <path {...stroke} d="M9 21v-7h6v7" />
    </Icon>
  );
}

export function RequestsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect {...stroke} height="18" rx="2" width="16" x="4" y="3" />
      <path {...stroke} d="M8 8h8M8 12h8M8 16h5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function ServicesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect {...stroke} height="7" rx="2" width="7" x="3" y="3" />
      <rect {...stroke} height="7" rx="2" width="7" x="14" y="3" />
      <rect {...stroke} height="7" rx="2" width="7" x="3" y="14" />
      <rect {...stroke} height="7" rx="2" width="7" x="14" y="14" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle {...stroke} cx="12" cy="8" r="4" />
      <path {...stroke} d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path {...stroke} d="M10 21h4" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M10 17l5-5-5-5M15 12H3" />
      <path {...stroke} d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
    </Icon>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z" />
      <path
        {...stroke}
        d="M9 8.4c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.6.7c-.2.2-.1.4 0 .6.7 1.1 1.6 1.9 2.8 2.4.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.9.9c.3.1.4.3.4.6 0 .8-.4 1.5-1 1.9-.6.4-1.5.6-2.4.3-1.4-.4-3.1-1.2-4.8-2.8-1.4-1.4-2.3-3.2-2.6-4.3-.2-.6-.1-1.1.1-1.4Z"
      />
    </Icon>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
      <path {...stroke} d="M8 9h8M8 13h5" />
    </Icon>
  );
}

export function PaperclipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        {...stroke}
        d="m20.5 11.5-8.4 8.4a5 5 0 0 1-7.1-7.1l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 1 1-2.8-2.8l8.3-8.3"
      />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path {...stroke} d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect {...stroke} height="12" rx="4" width="8" x="8" y="2" />
      <path {...stroke} d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path {...stroke} d="M22 2 11 13" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="m5 12 4 4L19 6" />
    </Icon>
  );
}

export function CheckCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="m2 12 4 4L16 6" />
      <path {...stroke} d="m9 15 2 2L22 6" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle {...stroke} cx="11" cy="11" r="7" />
      <path {...stroke} d="m20 20-4-4" />
    </Icon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M4 6h16M7 12h10M10 18h4" />
    </Icon>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M19 12H5M12 19l-7-7 7-7" />
    </Icon>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path {...stroke} d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle {...stroke} cx="12" cy="12" r="9" />
      <path {...stroke} d="M12 7v5l3 2" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="m9 18 6-6-6-6" />
    </Icon>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect {...stroke} height="8" rx="2" width="8" x="3" y="3" />
      <rect {...stroke} height="8" rx="2" width="8" x="13" y="3" />
      <rect {...stroke} height="8" rx="2" width="8" x="3" y="13" />
      <rect {...stroke} height="8" rx="2" width="8" x="13" y="13" />
    </Icon>
  );
}

export function VerifiedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        {...stroke}
        d="m12 2 2.1 2.2 3-.2.8 2.9 2.6 1.5-.9 2.9.9 2.9-2.6 1.5-.8 2.9-3-.2L12 22l-2.1-2.2-3 .2-.8-2.9-2.6-1.5.9-2.9-.9-2.9 2.6-1.5.8-2.9 3 .2L12 2Z"
      />
      <path {...stroke} d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle fill="currentColor" cx="5" cy="12" r="1.5" />
      <circle fill="currentColor" cx="12" cy="12" r="1.5" />
      <circle fill="currentColor" cx="19" cy="12" r="1.5" />
    </Icon>
  );
}

export function InstallIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path {...stroke} d="M5 15v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3" />
    </Icon>
  );
}

export function FinanceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect {...stroke} height="16" rx="3" width="20" x="2" y="4" />
      <path {...stroke} d="M16 9h6v6h-6a3 3 0 0 1 0-6Z" />
      <circle fill="currentColor" cx="17" cy="12" r="1" />
      <path {...stroke} d="M6 8h5" />
    </Icon>
  );
}

export function OperationsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle {...stroke} cx="16" cy="7" r="2" />
      <circle {...stroke} cx="8" cy="17" r="2" />
    </Icon>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path {...stroke} d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" />
      <path
        {...stroke}
        d="M12 8.5c0 2-1.5 3.5-3.5 3.5 2 0 3.5 1.5 3.5 3.5 0-2 1.5-3.5 3.5-3.5-2 0-3.5-1.5-3.5-3.5Z"
      />
    </Icon>
  );
}
