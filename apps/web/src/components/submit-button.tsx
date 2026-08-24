"use client";

import { useFormStatus } from "react-dom";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Button } from "@itqanak/ui";

interface SubmitButtonProps extends Omit<ComponentPropsWithoutRef<typeof Button>, "type"> {
  readonly children: ReactNode;
  readonly pendingLabel?: string;
}

export function SubmitButton({
  children,
  pendingLabel = "جارٍ الإرسال…",
  disabled = false,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} disabled={disabled || pending} type="submit">
      {pending ? pendingLabel : children}
    </Button>
  );
}
