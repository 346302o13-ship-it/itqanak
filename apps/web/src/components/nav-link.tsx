"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * A `<Link>` that shows an immediate inline "loading" hint while the next route
 * is still resolving. Most authenticated pages are `force-dynamic` with no
 * `loading.tsx` yet, so a plain nav click looks unresponsive for 1–3s; this is
 * the quick patch the App Router docs recommend until route-level skeletons land.
 */
function PendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className="itq-linkhint" data-pending={pending} />;
}

type NavLinkProps = ComponentProps<typeof Link> & { readonly children: ReactNode };

export function NavLink({ children, ...props }: NavLinkProps) {
  return (
    <Link {...props}>
      {children}
      <PendingHint />
    </Link>
  );
}
