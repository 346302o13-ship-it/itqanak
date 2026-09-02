import { redirect } from "next/navigation";

// Short, memorable link to hand out in social posts. It lands on the Arabic
// install page; the English page is one language switch away via its metadata.
export default function InstallRedirect(): never {
  redirect("/ar/install");
}
