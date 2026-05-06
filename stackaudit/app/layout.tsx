import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "StackAudit | AI Spend Optimization for Startups",
    template: "%s | StackAudit",
  },
  description:
    "Automatically audit your team's AI tool subscriptions, discover unused seats, and uncover thousands in potential savings without slowing down engineering.",
  keywords: [
    "AI Spend",
    "SaaS Audit",
    "Cost Optimization",
    "Startup Finance",
    "Engineering Operations",
  ],
  authors: [{ name: "StackAudit Team" }],
  creator: "StackAudit",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://stackaudit.app",
    title: "StackAudit | Regain Control of Your AI Tool Spend",
    description:
      "Stop paying for idle Copilot seats and unused ChatGPT Plus accounts. StackAudit automatically discovers, tracks, and optimizes your company's AI subscriptions.",
    siteName: "StackAudit",
    images: [
      {
        url: "https://stackaudit.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "StackAudit OG Image",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StackAudit | AI Spend Optimization for Startups",
    description:
      "Automatically audit your team's AI tool subscriptions and uncover thousands in potential savings.",
    images: ["https://stackaudit.app/og-image.png"],
    creator: "@stackaudit",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50 font-sans selection:bg-blue-500/30">
        {children}
      </body>
    </html>
  );
}
