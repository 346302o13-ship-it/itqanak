import type { Metadata } from "next";

import { LandingPage, type LandingPageCopy } from "@/components/marketing";
import { PublicShell } from "@/components/public-shell";
import { createContentRuntime } from "@/lib/content-runtime";

export const metadata: Metadata = {
  title: "ITQANAK | All your coursework help in one place",
  description:
    "Assignments, research, presentations, graduation projects and websites — order in a tap, follow from your phone, and start from 15 SAR.",
  alternates: { canonical: "/en", languages: { "ar-SA": "/ar", en: "/en" } },
  openGraph: {
    title: "ITQANAK | All your coursework help in one place",
    description:
      "From the daily assignment to your graduation project, at token prices with clear tracking.",
    locale: "en_US",
    type: "website",
    url: "/en",
    images: [{ url: "/images/itqanak-hero-v2.png", alt: "ITQANAK educational support platform" }],
  },
};
export const dynamic = "force-dynamic";

const landingCopy = {
  hero: {
    eyebrow: "Everything a student needs",
    title: "All your coursework help,",
    highlightedTitle: "in one place.",
    description:
      "From a daily assignment to your research paper, graduation project and website — pick a service, share the details, and follow every update from your phone. Prices start at 15 SAR.",
    status: "Services are available",
    primaryLabel: "Order now",
    whatsappLabel: "Ask us on WhatsApp",
    whatsappMessage: "Hello, I would like help choosing the right ITQANAK service.",
    imageAlt: "A student portal view showing a request, its status and its files in ITQANAK",
    priceChips: [
      "Assignments from 20 SAR",
      "Presentations from 40 SAR",
      "Graduation projects from 30 SAR",
      "Subject tutoring from 15 SAR",
    ],
  },
  trustItems: [
    {
      icon: "route",
      title: "Everything in one place",
      description:
        "Assignments, research, slides, projects and websites — one window, not a dozen chats.",
    },
    {
      icon: "message",
      title: "Follow it from your phone",
      description:
        "An instant notification on every reply or update, with your files kept in your account.",
    },
    {
      icon: "sparkles",
      title: "Token prices",
      description:
        "Starting at 15 SAR, with the final price agreed clearly before any work begins.",
    },
  ],
  services: {
    eyebrow: "Most requested",
    title: "Everything you need as a student — in one place",
    description:
      "The services students ask for most, with approximate starting prices. Tap a service to open its details and start.",
    items: [
      {
        icon: "document",
        emoji: "📚",
        tone: "warning",
        badge: "🔥 Most requested",
        priceLabel: "From 20 SAR",
        title: "Assignment review & guidance",
        description:
          "We review your work, flag the mistakes and walk you through the idea — so you submit with confidence.",
        slug: "assignment-guidance",
      },
      {
        icon: "palette",
        emoji: "🎨",
        tone: "info",
        badge: "🔥 Most requested",
        priceLabel: "From 40 SAR",
        title: "Presentation visual design",
        description: "A clean, cohesive slide deck for any course, ready to print or present.",
        slug: "presentation-visual-design",
      },
      {
        icon: "compass",
        emoji: "🚀",
        tone: "success",
        badge: "🔥 Most requested",
        priceLabel: "From 30 SAR",
        title: "Graduation project guidance",
        description:
          "Practical direction for the idea, plan, build and defence — from start to submission.",
        slug: "project-guidance",
      },
      {
        icon: "document",
        emoji: "📝",
        tone: "danger",
        priceLabel: "From 25 SAR",
        title: "Document formatting & review",
        description:
          "Language review and professional formatting for your paper or report, to your university's rules.",
        slug: "document-formatting-review",
      },
      {
        icon: "training",
        emoji: "💡",
        tone: "accent",
        priceLabel: "From 15 SAR",
        title: "Subject tutoring",
        description:
          "A session focused on the hard parts of your course, with simple explanations and worked examples.",
        slug: "subject-tutoring",
      },
      {
        icon: "code",
        emoji: "💻",
        tone: "brand",
        priceLabel: "From 60 SAR",
        title: "Website development",
        description:
          "A website or online store for your project, cleanly built with a walkthrough of how to run it.",
        slug: "website-development",
      },
    ],
    itemCta: "Order now",
    allCta: "View all services",
  },
  process: {
    eyebrow: "Simple and fast",
    title: "Order in just 3 steps",
    description:
      "From choosing a service to receiving the work — every step is clear, and you can ask us on WhatsApp any time.",
    steps: [
      {
        title: "Choose your service",
        description: "Assignment, research, slides, project or website — pick the closest fit.",
      },
      {
        title: "Share the details",
        description:
          "Write what you need and attach your files, or message us directly on WhatsApp.",
      },
      {
        title: "Follow it from your phone",
        description:
          "You get a notification on every update, and download the finished work from your account.",
      },
    ],
  },
  portal: {
    eyebrow: "Your private portal",
    title: "Every request and file on one page",
    description:
      "From the saved draft to the finished download, each request's details, status and files stay tidy and easy to return to.",
    points: [
      "A clear reference number for every request.",
      "Plain-language statuses that show where it is and whether it needs you.",
      "An ordered timeline that keeps every important update.",
      "Your files stay private — and you can open them from your device even after the request ends.",
    ],
    cta: "Open the student portal",
  },
  why: {
    eyebrow: "Why ITQANAK?",
    title: "Designed around clarity and privacy",
    description:
      "We organise the whole service journey so you always know what was shared, what changed and what comes next.",
    items: [
      {
        icon: "lock",
        title: "Private & secure",
        description:
          "Your request and files are seen only by you and the team authorised to work on them.",
      },
      {
        icon: "files",
        title: "Your files, kept",
        description:
          "Every file stays with its request, and you can open it from your device even after it ends.",
      },
      {
        icon: "message",
        title: "Live updates",
        description: "An instant notification on your phone for every reply or change of status.",
      },
      {
        icon: "headphones",
        title: "Human help nearby",
        description:
          "Ask us on WhatsApp before ordering and we'll help you pick the right service.",
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
        question: "How much does a service cost?",
        answer:
          "Most services show an approximate starting price (“from …”) and begin at 15 SAR. The final price is agreed after we review your request's scope, files and timing; a few services are priced after a quick chat.",
      },
      {
        question: "How do I choose the right service?",
        answer:
          "Review the outcome described for each service. If your need spans more than one area, message us on WhatsApp and we will help route it.",
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
    eyebrow: "Ready to start?",
    title: "Turn your need into a clear request in under a minute",
    description: "Choose your service now, or ask us on WhatsApp if you'd like help choosing.",
    primaryLabel: "Order now",
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
