import { redirect } from "next/navigation";

interface RequestsPageProps {
  readonly searchParams: Promise<{ readonly q?: string | readonly string[] }>;
}

export const dynamic = "force-dynamic";

// The request inbox merged into the unified conversation centre; this route
// stays only so existing links and bookmarks land in the right place.
export default async function AdminRequestsRedirect({ searchParams }: RequestsPageProps) {
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  redirect(
    search.length === 0 ? "/en/admin/support" : `/en/admin/support?q=${encodeURIComponent(search)}`,
  );
}
