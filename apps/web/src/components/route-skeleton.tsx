import { Skeleton } from "@itqanak/ui";

/**
 * Standalone shell-shaped placeholder for a segment `loading.tsx`. The real
 * portal shell lives inside each page, so during navigation this renders alone;
 * shaping it like the shell keeps the swap quiet instead of flashing bare
 * content. `variant="chat"` swaps the content column for a conversation shape.
 */
export function RouteSkeleton({ variant = "page" }: { readonly variant?: "page" | "chat" }) {
  return (
    <div
      className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]"
      role="status"
      aria-label="Loading"
    >
      <aside className="hidden lg:block">
        <div className="mb-6 flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-11" />
          <Skeleton className="h-11 opacity-80" />
          <Skeleton className="h-11 opacity-60" />
          <Skeleton className="h-11 opacity-40" />
        </div>
      </aside>

      <div className="rounded-[1.75rem] border border-[color:var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-8">
        {variant === "chat" ? <ChatBody /> : <PageBody />}
      </div>
    </div>
  );
}

function PageBody() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid gap-2.5">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14 opacity-70" />
        <Skeleton className="h-14 opacity-40" />
      </div>
    </div>
  );
}

function ChatBody() {
  return (
    <div className="flex min-h-[26rem] flex-col gap-3">
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className="flex-1 space-y-3 rounded-2xl bg-[color:var(--itq-color-surface-soft)] p-4">
        <Skeleton className="h-12 w-2/3 rounded-2xl" />
        <Skeleton className="ms-auto h-12 w-1/2 rounded-2xl" />
        <Skeleton className="h-16 w-3/4 rounded-2xl" />
        <Skeleton className="ms-auto h-10 w-2/5 rounded-2xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-2xl" />
    </div>
  );
}

/** Back-compat named export used by the chat segment loading files. */
export function ChatSkeleton() {
  return <RouteSkeleton variant="chat" />;
}
