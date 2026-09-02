import { InstallLanding } from "@/components/install-landing";
import { buildInstallMetadata } from "@/lib/install-page-meta";

export const metadata = buildInstallMetadata("en", "/en/install");

export const dynamic = "force-dynamic";

export default function EnglishInstallPage() {
  return <InstallLanding locale="en" />;
}
