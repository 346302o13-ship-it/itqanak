import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "إتقانك | منصة دعم أكاديمي وتعليمي",
    template: "%s | إتقانك",
  },
  description: "منصة إتقانك قيد إعادة البناء لتقديم خدمات تعليمية مشروعة وآمنة.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html dir="rtl" lang="ar">
      <body>{children}</body>
    </html>
  );
}
