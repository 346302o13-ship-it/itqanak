import { redirect } from "next/navigation";

interface PageProps {
  readonly searchParams: Promise<{ readonly notice?: string | string[] }>;
}

export const dynamic = "force-dynamic";

// Phone verification and password recovery are now one tabbed "Approvals"
// screen; this route stays so existing links and notifications still land right.
export default async function PasswordResetsRedirect({ searchParams }: PageProps) {
  const query = await searchParams;
  const notice =
    typeof query.notice === "string" ? `&notice=${encodeURIComponent(query.notice)}` : "";
  redirect(`/ar/admin/approvals?tab=reset${notice}`);
}
