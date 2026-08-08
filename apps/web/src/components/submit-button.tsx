"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@itqanak/ui";

interface SubmitButtonProps {
  readonly children: string;
  readonly pendingLabel?: string;
  readonly className?: string;
  readonly disabled?: boolean;
}

export function SubmitButton({
  children,
  pendingLabel = "جارٍ الإرسال…",
  className,
  disabled = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button className={className} disabled={disabled || pending} type="submit">
      {pending ? pendingLabel : children}
    </Button>
  );
}
