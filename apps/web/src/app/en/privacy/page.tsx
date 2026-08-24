import type { Metadata } from "next";

import { LegalPage, type LegalPageCopy } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How ITQANAK collects, uses and protects account, request, conversation and file data.",
  alternates: {
    canonical: "/en/privacy",
    languages: { "ar-SA": "/ar/privacy", en: "/en/privacy" },
  },
  openGraph: {
    title: "Privacy Policy | ITQANAK",
    description:
      "A clear account of data used for accounts, requests, conversations, files and WhatsApp verification.",
    locale: "en_US",
    type: "website",
    url: "/en/privacy",
  },
};

const copy = {
  locale: "en",
  alternateHref: "/ar/privacy",
  eyebrow: "Privacy is part of the service",
  title: "ITQANAK Privacy Policy",
  introduction:
    "This policy explains the data ITQANAK needs to operate accounts, requests and conversations and verify mobile numbers, how we use and protect it, and the choices available to you.",
  versionLabel: "Version",
  version: "2026-08",
  effectiveLabel: "Effective date",
  effectiveDate: "12 August 2026",
  contentsLabel: "Contents",
  notice:
    "Only send the minimum information needed. Never send passwords, payment-card details or sensitive information your request does not require.",
  sections: [
    {
      id: "scope",
      title: "Who is responsible and what is covered?",
      paragraphs: [
        "This policy covers the ITQANAK platform, website, student portal, request dashboard, conversations and related support contact. ITQANAK is responsible for processing data within these services for the purposes described here.",
        "Separate policies may apply when you choose to open an external service such as WhatsApp. WhatsApp and Meta process data under their own policies, while ITQANAK remains responsible for information it receives and keeps in its systems.",
      ],
    },
    {
      id: "data-we-collect",
      title: "Data we collect",
      paragraphs: [
        "We collect information you provide directly, technical data needed to operate and protect the platform, and interaction records produced when you use the service.",
      ],
      bullets: [
        "Account data: name, country code, mobile number, protected password representation, consent versions and mobile-verification state.",
        "Request data: service type, description, requested date, status, decisions, updates and information entered in request fields.",
        "Conversation data: text, images, files, voice recordings, action cards, sent times and delivered or read states.",
        "Technical and security data: network address, browser and device information, sessions, sign-in and error logs, abuse signals and administrative action records.",
        "Support and WhatsApp data: messages you send support, the number displayed, manual matching outcome, and notes needed to handle your enquiry.",
      ],
    },
    {
      id: "sources",
      title: "Where data comes from",
      paragraphs: [
        "Most data comes from you when you register, create a request, or send a message or attachment. We create some records automatically, including request and session identifiers, timestamps, message states and security logs.",
        "When you start a WhatsApp conversation with support, we receive what you choose to send and information WhatsApp shows to the recipient. We do not ask for access to your contacts or other WhatsApp conversations.",
      ],
    },
    {
      id: "purposes",
      title: "Why we use data",
      paragraphs: [
        "We use information to the extent needed to provide the service you request, manage our relationship with you, and operate a dependable and secure platform.",
      ],
      bullets: [
        "Create accounts, authenticate users, manage sessions, verify mobile numbers and help restore access.",
        "Understand, scope and fulfil requests, manage timing, and show updates and actions to you and the manager.",
        "Operate conversations, attachments and message states, and send service notices about an account or request.",
        "Scan files, prevent fraud and misuse, investigate incidents, and protect people, rights and systems.",
        "Meet legal duties, address complaints, and improve reliability and usability with aggregated or minimised data where practical.",
      ],
    },
    {
      id: "whatsapp",
      title: "WhatsApp verification and support",
      paragraphs: [
        "To activate a mobile account, you must message the official +966 56 420 2263 number from the WhatsApp number matching your registration. An authorised person compares the numbers and updates the account manually, and may keep a concise record of the verification decision for security and audit purposes.",
        "WhatsApp verification does not give us access to your phone or other conversations. Do not send a password or identity document unless support explains a legitimate reason and a safe method; matching the number will normally be sufficient.",
      ],
    },
    {
      id: "legal-bases",
      title: "Grounds for processing",
      paragraphs: [
        "Depending on applicable law, we process data to fulfil your request and manage the account, with consent where required, for legitimate purposes such as platform security, fraud prevention and reliability, and to meet legal duties or establish and defend rights.",
        "Where we rely on consent that can be withdrawn, you may withdraw it for future processing through support. Withdrawal does not invalidate earlier processing and may prevent us providing a feature that depends on the data.",
      ],
    },
    {
      id: "sharing",
      title: "When data is shared",
      paragraphs: [
        "We do not sell personal data. We share the minimum needed with the manager and authorised personnel or collaborators working on a request, and with technology providers supporting hosting, databases, storage, file scanning and communications, subject to appropriate confidentiality and security restrictions where available.",
      ],
      bullets: [
        "We may disclose information where a law or valid order requires it, or to protect a person, the platform or legal rights.",
        "If ownership of the platform or business changes, data may transfer subject to this policy or notice of a material change.",
        "WhatsApp and Meta receive contact information you send through their service as independent providers under their own terms and policies.",
      ],
    },
    {
      id: "international-transfers",
      title: "Cross-border processing",
      paragraphs: [
        "Some hosting or communications providers may process data in a country different from where you live. When this occurs, we choose arrangements appropriate to the data and applicable requirements, minimise transfers, and use contractual or technical safeguards where needed.",
        "Using the platform from Saudi Arabia, the United Arab Emirates or Kuwait does not necessarily mean every provider system is located in the same country.",
      ],
    },
    {
      id: "retention",
      title: "Retention and deletion",
      paragraphs: [
        "We keep data while it is needed for the account, request and purpose for which it was collected, then delete or reasonably de-identify it. Timing varies with request status, file type, security and accounting needs, disputes and legal duties.",
        "Limited copies may remain in backups until their ordinary deletion cycle and are isolated from routine use. Security and audit records may be kept longer where needed to evidence an action, prevent misuse or meet an obligation.",
      ],
    },
    {
      id: "security",
      title: "How we protect data",
      paragraphs: [
        "We use organisational and technical measures appropriate to the service, including access controls, password protection, storage separation, security-event logging, attachment scanning and transport protection where the channel supports it. No electronic method can guarantee absolute security.",
        "You help by choosing a strong password, not sharing it, signing out on shared devices and reporting unusual activity promptly. We may contact you if an incident affects your data and notice is required or appropriate.",
      ],
    },
    {
      id: "rights",
      title: "Your rights and choices",
      paragraphs: [
        "Subject to applicable law, you may be able to request access, correction, a copy, deletion or restricted processing, object to processing, withdraw consent, and complain to a competent authority. Legal exceptions may apply to some requests.",
        "Submit a request on WhatsApp from your registered number and identify the account and right concerned. We will verify identity proportionately before disclosure or change and may ask for more information if number matching is insufficient. We will not ask for your password.",
      ],
    },
    {
      id: "cookies-children-updates",
      title: "Cookies, minors and policy updates",
      paragraphs: [
        "The platform uses cookies or similar technology necessary for sign-in, session protection and essential preferences. We will not add non-essential marketing cookies without appropriate notice and choice where required.",
        "If you cannot lawfully enter the agreement or consent to processing in your country, a parent, guardian or legal representative must use the service and give any required permissions. Do not submit a child's or another person's data without authority.",
        "We may update this policy as the service or requirements change. We will display the version and effective date and provide notice or seek renewed consent where law requires it or a change is material.",
      ],
    },
  ],
  contactEyebrow: "Privacy request or question",
  contactTitle: "Contact us from your registered number",
  contactDescription:
    "Describe your request and the relevant account or information on WhatsApp. We will verify the number before acting on account data.",
  contactLabel: "Contact privacy support",
  contactMessage:
    "Hello, I have a request or question about the ITQANAK Privacy Policy, version 2026-08.",
  relatedHref: "/en/terms",
  relatedLabel: "Read the Terms of Use",
} satisfies LegalPageCopy;

export default function EnglishPrivacyPage() {
  return <LegalPage copy={copy} />;
}
