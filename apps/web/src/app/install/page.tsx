import { InstallLanding } from "@/components/install-landing";
import { buildInstallMetadata } from "@/lib/install-page-meta";

// The short link handed out in social posts. It renders the install page in
// place (rather than redirecting) so link-preview crawlers that do not follow
// a 3xx still read the Open Graph card. Humans keep the clean /install URL.
export const metadata = buildInstallMetadata("ar", "/install", "/ar/install");

export const dynamic = "force-dynamic";

export default function InstallPage() {
  return <InstallLanding locale="ar" />;
}
