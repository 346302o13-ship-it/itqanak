"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { SubmitButton } from "./submit-button";

const opaqueTokenPattern = /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/;

interface FragmentTokenFormProps {
  readonly action: string;
  readonly children?: ReactNode;
  readonly csrfToken: string | undefined;
  readonly missingMessage: string;
  readonly pendingLabel: string;
  readonly submitLabel: string;
}

export function FragmentTokenForm({
  action,
  children,
  csrfToken,
  missingMessage,
  pendingLabel,
  submitLabel,
}: FragmentTokenFormProps) {
  const [fragmentState, setFragmentState] = useState({ loaded: false, token: "" });
  const consumedFragment = useRef(false);

  useEffect(() => {
    const consumeFragment = () => {
      const fragment = globalThis.location.hash;
      if (fragment.length === 0 && consumedFragment.current) {
        return;
      }

      consumedFragment.current = true;
      const candidate = new URLSearchParams(fragment.slice(1)).get("token") ?? "";
      const token = opaqueTokenPattern.test(candidate) ? candidate : "";
      if (fragment.length > 0) {
        globalThis.history.replaceState(
          null,
          "",
          `${globalThis.location.pathname}${globalThis.location.search}`,
        );
      }
      setFragmentState({ loaded: true, token });
    };

    consumeFragment();
    globalThis.addEventListener("hashchange", consumeFragment);
    return () => globalThis.removeEventListener("hashchange", consumeFragment);
  }, []);

  const usable = fragmentState.loaded && fragmentState.token.length > 0;
  return (
    <form action={action} className="grid gap-5" method="post">
      <input name="csrfToken" type="hidden" value={csrfToken ?? ""} />
      <input name="token" type="hidden" value={fragmentState.token} />
      {fragmentState.loaded && !usable ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-950"
          role="status"
        >
          {missingMessage}
        </p>
      ) : null}
      {children}
      <SubmitButton className="w-full" disabled={!usable} pendingLabel={pendingLabel}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
