"use client";

import { ErrorView } from "@/components/error-view";

export default function ErrorPage({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <ErrorView kind="error" reset={reset} {...(error.digest ? { digest: error.digest } : {})} />;
}
