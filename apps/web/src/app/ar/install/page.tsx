import { InstallLanding } from "@/components/install-landing";
import { buildInstallMetadata } from "@/lib/install-page-meta";

export const metadata = buildInstallMetadata("ar", "/ar/install");

export const dynamic = "force-dynamic";

export default function ArabicInstallPage() {
  return <InstallLanding locale="ar" />;
}
