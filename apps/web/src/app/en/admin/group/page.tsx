import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The student group now lives inside the unified conversation workspace,
// selectable from the conversation list — this route only keeps old links
// and bookmarks pointing at the right place.
export default function EnglishAdminGroupRedirect() {
  redirect("/en/admin/support?view=group");
}
