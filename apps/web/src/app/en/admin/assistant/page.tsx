import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The assistant now renders inside the unified conversation centre as a
// pinned entry — this route stays only so existing links and bookmarks land
// in the right place.
export default function EnglishAdminAssistantRedirect() {
  redirect("/en/admin/support?assistant=1");
}
