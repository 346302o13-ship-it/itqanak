import type { Metadata } from "next";

import { LegalPage, type LegalPageCopy } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "Terms governing ITQANAK student accounts, requests, conversations, files and services.",
  alternates: {
    canonical: "/en/terms",
    languages: { "ar-SA": "/ar/terms", en: "/en/terms" },
  },
  openGraph: {
    title: "Terms of Use | ITQANAK",
    description:
      "Rules governing accounts, requests, conversations and educational support services.",
    locale: "en_US",
    type: "website",
    url: "/en/terms",
  },
};

const copy = {
  locale: "en",
  alternateHref: "/ar/terms",
  eyebrow: "A clear legal document",
  title: "ITQANAK Terms of Use",
  introduction:
    "These terms explain your relationship with ITQANAK when you create an account, submit a request, or use conversations, files and support services. Please read them before registering and keep a copy.",
  versionLabel: "Version",
  version: "2026-08",
  effectiveLabel: "Effective date",
  effectiveDate: "12 August 2026",
  contentsLabel: "Contents",
  notice:
    "Any mandatory consumer rights available under applicable law remain unaffected and are not excluded by these terms.",
  sections: [
    {
      id: "scope-and-acceptance",
      title: "Scope and acceptance",
      paragraphs: [
        "These terms apply to the website, student portal, request dashboard, conversations and related services provided by ITQANAK. Creating an account, submitting a request or continuing to use the platform means you accept the version presented at registration.",
        "If you use the platform for another person or organisation, you confirm that you are authorised to bind them to these terms. If you do not agree, do not create an account or submit a request.",
      ],
    },
    {
      id: "account",
      title: "Your account and access security",
      paragraphs: [
        "You must provide an accurate name, a mobile number you own or are authorised to use, and the correct country from Saudi Arabia, the United Arab Emirates or Kuwait. You are responsible for keeping your password confidential and for activity from your account sessions.",
      ],
      bullets: [
        "Do not share your password or authenticated session, or allow anyone to use the account on your behalf.",
        "Tell support promptly if you suspect unauthorised access or lose control of your mobile number.",
        "We may ask you to update inaccurate details or temporarily restrict an account where security requires it.",
      ],
    },
    {
      id: "whatsapp-verification",
      title: "Mobile verification through WhatsApp",
      paragraphs: [
        "Your account is activated after you message ITQANAK support at +966 56 420 2263 from the WhatsApp number matching your registration. Review is manual, and support may request limited information needed to match the account.",
        "Never send your password or session credentials over WhatsApp. Confirmation shows practical control of the number at review time, but is not an independent guarantee of civil identity. Activation may be delayed if details cannot be matched or misuse is suspected.",
      ],
    },
    {
      id: "responsible-services",
      title: "Service purpose and academic integrity",
      paragraphs: [
        "ITQANAK provides responsible educational support such as explanation, training, review, editing, translation, design and technical assistance. You remain responsible for understanding and checking the output and following your institution's rules.",
      ],
      bullets: [
        "You must not request or use a service for cheating, impersonation, taking an examination, or submitting assessed work as your own where the rules prohibit it.",
        "We may refuse or stop a request that conflicts with academic integrity, law or third-party rights.",
        "A service does not guarantee a grade, admission or specific academic result, and does not replace instructions from your institution.",
      ],
    },
    {
      id: "requests-and-quotes",
      title: "Requests, scope and approval",
      paragraphs: [
        "Creating a request does not mean automatic acceptance. You must describe the requirement accurately, state the requested deadline and provide the necessary materials. The manager may ask questions before confirming scope, timing and any fee or request-specific condition through an approved channel.",
        "The public platform does not display general service prices. A request-specific proposal becomes binding only after you approve it in the manner shown in the conversation. If a general description conflicts with a written request agreement, that specific agreement controls to the extent it is consistent with these terms.",
      ],
    },
    {
      id: "chat-and-notifications",
      title: "Conversations, notifications and message status",
      paragraphs: [
        "The request conversation lets you communicate with the manager and send text, images, voice recordings and files. It may also contain system notices or action cards asking you to approve, provide information or follow a request stage.",
        "Sent, delivered and read states are technical progress indicators, not conclusive proof of understanding or legal acceptance. Do not rely on instant notification for urgent matters; check the request page and WhatsApp where appropriate.",
      ],
    },
    {
      id: "files-and-rights",
      title: "Files, content and third-party rights",
      paragraphs: [
        "You retain ownership of content you send and grant ITQANAK a limited permission to process, store and show it to authorised personnel as needed to fulfil the request, operate the platform and protect it. You confirm that you may submit the content and that it does not breach privacy, copyright or confidentiality rights.",
      ],
      bullets: [
        "Attachments may be scanned automatically for malware and quarantined, rejected or deleted if they pose a risk.",
        "Do not upload passwords, full financial details, medical records or information the request does not need.",
        "Preview or recording quality may change during transfer or compression; keep your own original copy of important files.",
      ],
    },
    {
      id: "changes-cancellation",
      title: "Changes, cancellation and delivery estimates",
      paragraphs: [
        "Timing depends on complete information, your response time and the amount of work. An estimated date is only a firm commitment if the manager expressly confirms it in the request. A material change after work starts may require an updated scope, date or proposal.",
        "Cancellation and any refund are assessed against the stage reached, work and third-party costs already incurred, the request-specific conditions you accepted, and mandatory legal rights. Contact the manager inside the request before taking action.",
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      paragraphs: [
        "You must use the platform lawfully and respectfully. You may not compromise the service, bypass access controls, impersonate others, submit malware or unlawful or abusive content, harass support, harvest user data, or use automation that harms the service.",
        "We may take proportionate protective measures, including rate-limiting, removing harmful content, suspending an account and investigating activity, subject to applicable rights.",
      ],
    },
    {
      id: "availability-liability",
      title: "Availability and responsibility",
      paragraphs: [
        "We use reasonable professional care to operate the platform and deliver agreed services, but maintenance, faults, hosting and communications providers, or WhatsApp may affect availability. We do not promise uninterrupted service or that every file or result will be error-free.",
        "To the extent the law allows, ITQANAK is not responsible for indirect loss or consequences caused by inaccurate information you provide, use outside the agreed purpose, or your breach of institutional rules. This does not limit liability that cannot lawfully be excluded.",
      ],
    },
    {
      id: "suspension",
      title: "Account suspension or closure",
      paragraphs: [
        "You may stop using the platform and ask support to close your account. ITQANAK may suspend or close an account for a material breach, security risk or lawful request, with appropriate notice where reasonably possible.",
        "Closing an account does not immediately erase every record. We may retain information needed to complete open requests, address disputes or comply with legal duties as described in the Privacy Policy.",
      ],
    },
    {
      id: "updates-and-contact",
      title: "Updates and contact",
      paragraphs: [
        "We may update these terms as the service or requirements change. We will publish the version and effective date and seek renewed acceptance where a change is material or law requires it. An update does not retrospectively change a completed request's specific terms unless you agree or law requires it.",
        "For a question, objection or good-faith attempt to resolve a dispute, contact support on WhatsApp from your registered number before using any available formal route.",
      ],
    },
  ],
  contactEyebrow: "Need clarification?",
  contactTitle: "Ask ITQANAK support before accepting",
  contactDescription:
    "Send a question about a specific clause from your registered WhatsApp number. We will never ask for your password or account credentials.",
  contactLabel: "Ask on WhatsApp",
  contactMessage: "Hello, I have a question about the ITQANAK Terms of Use, version 2026-08.",
  relatedHref: "/en/privacy",
  relatedLabel: "Read the Privacy Policy",
} satisfies LegalPageCopy;

export default function EnglishTermsPage() {
  return <LegalPage copy={copy} />;
}
