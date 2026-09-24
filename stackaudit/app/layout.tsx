import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://stackaudit.ai"),

  title: {
    default: "StackAudit — AI Spend Audits for Engineering Teams",
    template: "%s | StackAudit",
  },

  description:
    "Audit your AI tooling spend, identify unused subscriptions, compare plans, and uncover savings opportunities across ChatGPT, Claude, Cursor, Copilot, Gemini, and more.",

  keywords: [
    "AI spend audit",
    "ChatGPT enterprise pricing",
    "Claude pricing",
    "Cursor pricing",
    "engineering budget optimization",
    "AI SaaS cost management",
    "developer tooling audit",
    "startup infrastructure savings",
  ],

  authors: [{ name: "StackAudit" }],
  creator: "StackAudit",
  publisher: "StackAudit",
  category: "technology",

  alternates: {
    canonical: "/",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  openGraph: {
    title: "StackAudit — Optimize Your AI Stack Spend",
    description:
      "Discover where your engineering team is overspending on AI subscriptions and infrastructure.",

    url: "https://stackaudit.ai",
    siteName: "StackAudit",
    locale: "en_US",
    type: "website",

    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "StackAudit AI Spend Audit Dashboard Preview",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "StackAudit — AI Spend Audits",
    description:
      "Find wasted AI spend across ChatGPT, Claude, Cursor, Copilot, Gemini, and more.",

    creator: "@stackaudit",
    images: ["/og-image.png"],
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background text-foreground antialiased font-sans`}>
        {children}
      </body>
    </html>
  );
}

