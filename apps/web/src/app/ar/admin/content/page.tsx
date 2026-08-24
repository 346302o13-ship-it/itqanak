import { ContentAdmin } from "@/components/content-admin";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createContentRuntime } from "@/lib/content-runtime";

interface ContentPageProps {
  readonly searchParams: Promise<{ readonly notice?: string | readonly string[] }>;
}

export const metadata = { title: "إدارة محتوى الصفحات" };
export const dynamic = "force-dynamic";

export default async function ArabicAdminContentPage({ searchParams }: ContentPageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/ar/admin/content", "ar", "admin.content.read"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const runtime = await createContentRuntime();
  let blocks;
  try {
    blocks = await runtime.content.listAdminBlocks(principal);
  } finally {
    await runtime.close();
  }
  return (
    <ContentAdmin
      blocks={blocks}
      csrfToken={csrfToken}
      displayName={principal.displayName}
      locale="ar"
      {...(typeof query.notice === "string" ? { notice: query.notice } : {})}
    />
  );
}
