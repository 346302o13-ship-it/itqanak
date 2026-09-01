import type { Metadata } from "next";

import { LandingPage, type LandingPageCopy } from "@/components/marketing";
import { PublicShell } from "@/components/public-shell";
import { createContentRuntime } from "@/lib/content-runtime";

export const metadata: Metadata = {
  title: "ITQANAK | Educational support, clearly",
  description:
    "Explore responsible educational services, submit your request securely, and follow every update from one clear student portal.",
  alternates: { canonical: "/en", languages: { "ar-SA": "/ar", en: "/en" } },
  openGraph: {
    title: "ITQANAK | Educational support, clearly",
    description: "Responsible services, private requests and clear progress tracking in one place.",
    locale: "en_US",
    type: "website",
    url: "/en",
    images: [{ url: "/images/itqanak-hero-v2.png", alt: "ITQANAK educational support platform" }],
  },
};
export const dynamic = "force-dynamic";

const landingCopy = {
  hero: {
    eyebrow: "Your journey from request to completion",
    title: "Educational support,",
    highlightedTitle: "organised around you.",
    description:
      "Choose the right service, share your requirements and files securely, then follow every update from one thoughtfully designed portal.",
    status: "Services are available",
    primaryLabel: "Explore services",
    whatsappLabel: "Ask us on WhatsApp",
    whatsappMessage: "Hello, I would like help choosing the right ITQANAK service.",
    imageAlt:
      "Abstract workspace with a laptop, protected files and voice messages representing request tracking",
  },
  trustItems: [
    {
      icon: "shield",
      title: "Private by design",
      description: "Your request and files are visible only to you and the authorised team.",
    },
    {
      icon: "route",
      title: "Clear progress",
      description: "Understand the current stage and review every important update in order.",
    },
    {
      icon: "message",
      title: "Human support",
      description: "Reach us directly on WhatsApp when you need help choosing a service.",
    },
  ],
  services: {
    eyebrow: "Support that fits your needs",
    title: "Practical educational expertise in one place",
    description:
      "Responsible services that help you understand, improve and present your own work while keeping academic responsibility with you.",
    items: [
      {
        icon: "translate",
        title: "Translation",
        description: "Clear human translation that preserves meaning and essential formatting.",
        slug: "document-translation",
      },
      {
        icon: "palette",
        title: "Design & presentations",
        description: "A polished visual system that makes your supplied content easier to read.",
        slug: "presentation-visual-design",
      },
      {
        icon: "document",
        title: "Formatting & review",
        description: "Professional language review and formatting for work you have prepared.",
        slug: "document-formatting-review",
      },
      {
        icon: "code",
        title: "Technical support",
        description: "Diagnose the issue and receive practical, secure steps to resolve it.",
        slug: "technical-consultation",
      },
      {
        icon: "compass",
        title: "Research guidance",
        description: "Methodological support for planning and evaluating appropriate resources.",
        slug: "research-method-guidance",
      },
      {
        icon: "training",
        title: "Training & explanation",
        description:
          "Interactive sessions focused on understanding and independent skill-building.",
        slug: "guided-learning-session",
      },
    ],
    itemCta: "Discover service",
    allCta: "View all services",
  },
  process: {
    eyebrow: "A simple, visible journey",
    title: "Three clear steps from requirement to progress",
    description:
      "The request flow is intentionally short, with enough room to explain what you need and attach helpful context.",
    steps: [
      { title: "Choose a service", description: "Review each outcome and select the closest fit." },
      {
        title: "Share the details",
        description: "Create a request, explain the outcome and add relevant files when needed.",
      },
      {
        title: "Follow every update",
        description: "Return to your portal at any time to review status, messages and files.",
      },
    ],
  },
  portal: {
    eyebrow: "Every request in its place",
    title: "A portal that gives you the complete picture",
    description:
      "From the first draft to the final update, the request, its status, conversation and files stay together in one easy-to-find workspace.",
    points: [
      "A unique reference number for every request.",
      "Plain-language statuses that show the stage and any action you need to take.",
      "An ordered activity history for important updates.",
      "Private attachments with controlled storage and security scanning.",
    ],
    cta: "Open student portal",
  },
  why: {
    eyebrow: "Why ITQANAK?",
    title: "Designed around clarity and privacy",
    description:
      "We organise the whole service journey so you always know what was shared, what changed and what comes next.",
    items: [
      {
        icon: "lock",
        title: "Genuine privacy",
        description: "Requests and attachments are protected by account-level access controls.",
      },
      {
        icon: "files",
        title: "Organised files",
        description: "Every file stays with its request and has a visible storage and scan status.",
      },
      {
        icon: "route",
        title: "Understandable stages",
        description: "Clear language tells you where the request is without technical noise.",
      },
      {
        icon: "headphones",
        title: "Human help",
        description: "A direct WhatsApp channel when you need guidance before ordering.",
      },
    ],
  },
  integrity: {
    eyebrow: "Responsible learning",
    title: "Academic integrity is part of the service",
    description:
      "We support legitimate explanation, review, formatting, guidance and development. We never impersonate students, take exams or bypass an institution's rules.",
    commitment:
      "Ideas, findings and assessed academic work remain the student's responsibility; our role is to support understanding and improve presentation.",
  },
  faq: {
    eyebrow: "Frequently asked questions",
    title: "Quick answers before you begin",
    description:
      "The essentials about requests, files and contact—plus direct support when needed.",
    items: [
      {
        question: "How do I choose the right service?",
        answer:
          "Review the outcome described for each service. If your need spans more than one area, message us on WhatsApp and we will help route it.",
      },
      {
        question: "Are service prices shown publicly?",
        answer:
          'Yes — every service shows an approximate starting price ("from …") so you can gauge fit before you order. The final price is set after we review your request\'s scope, files and timing, and you can ask us on WhatsApp first.',
      },
      {
        question: "Can I attach files?",
        answer:
          "Yes, where the service supports them. The service page indicates this and your request shows the status of every uploaded file.",
      },
      {
        question: "Who can see my request?",
        answer:
          "Only the account owner and authorised team members responsible for delivering or managing the service.",
      },
      {
        question: "What requests are not accepted?",
        answer:
          "We do not access another person's account, take assessed tests or assignments, or support cheating and academic impersonation.",
      },
    ],
    supportTitle: "Still have a question?",
    supportDescription:
      "Tell us briefly what you need and we will help you find the right starting point.",
    whatsappLabel: "Talk to support",
  },
  finalCta: {
    eyebrow: "Start when you are ready",
    title: "Turn your requirement into a request you can follow",
    description:
      "Explore the services first, or send us a WhatsApp message if you would like help choosing.",
    primaryLabel: "Browse services",
    whatsappLabel: "Ask on WhatsApp",
  },
} satisfies LandingPageCopy;

export default async function EnglishLandingPage() {
  const runtime = await createContentRuntime();
  let contentBlocks;
  try {
    contentBlocks = await runtime.content.listPublishedBlocks("LANDING");
  } finally {
    await runtime.close();
  }
  return (
    <PublicShell active="home" locale="en">
      <LandingPage contentBlocks={contentBlocks} copy={landingCopy} locale="en" />
    </PublicShell>
  );
}
