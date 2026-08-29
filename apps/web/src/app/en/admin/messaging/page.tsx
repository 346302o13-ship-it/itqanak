import { MessagingAdmin, type WhatsAppNotifyStatus } from "@/components/messaging-admin";
import { requireAdminPagePrincipal } from "@/lib/admin-page";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { createMessagingRuntime } from "@/lib/messaging-runtime";

interface PageProps {
  readonly searchParams: Promise<{ readonly notice?: string | readonly string[] }>;
}

export const metadata = { title: "Messaging & alerts" };
export const dynamic = "force-dynamic";

export default async function EnglishAdminMessagingPage({ searchParams }: PageProps) {
  const [principal, csrfToken, query] = await Promise.all([
    requireAdminPagePrincipal("/en/admin/messaging", "en", "admin.operations.read"),
    csrfTokenForPage(),
    searchParams,
  ]);
  const runtime = await createMessagingRuntime();
  try {
    const [settings, stats] = await Promise.all([
      runtime.messaging.getAdminSettings(principal),
      runtime.messaging.getNotifyOutboxStats(principal),
    ]);
    const wa = runtime.config.whatsapp;
    const whatsapp: WhatsAppNotifyStatus = {
      mode: wa.mode,
      phoneNumberConfigured: (wa.phoneNumberId ?? "").length > 0,
      templateConfigured: (wa.templateName ?? "").length > 0,
      tokenConfigured: (runtime.config.whatsappAccessToken ?? "").length > 0,
      ...(wa.supportRecipientE164 === undefined
        ? {}
        : { envRecipientE164: wa.supportRecipientE164 }),
      ...((settings.whatsappNotifyRecipientE164 ?? wa.supportRecipientE164) === undefined
        ? {}
        : {
            resolvedRecipientE164: settings.whatsappNotifyRecipientE164 ?? wa.supportRecipientE164,
          }),
      delivered24h: stats.delivered24h,
      queued: stats.queued,
      deadLetter: stats.deadLetter,
      ...(stats.lastDeliveredAt === undefined ? {} : { lastDeliveredAt: stats.lastDeliveredAt }),
    };
    return (
      <MessagingAdmin
        csrfToken={csrfToken}
        displayName={principal.displayName}
        locale="en"
        settings={settings}
        whatsapp={whatsapp}
        {...(typeof query.notice === "string" ? { notice: query.notice } : {})}
      />
    );
  } finally {
    await runtime.close();
  }
}
