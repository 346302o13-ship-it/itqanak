import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The assistant now renders inside the unified conversation with support —
// this route stays only so existing links and bookmarks land in the right
// place.
export default function EnglishStudentAssistantRedirect() {
  redirect("/en/student/support?assistant=1");
}
