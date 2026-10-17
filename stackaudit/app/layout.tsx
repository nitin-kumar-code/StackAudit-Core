import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://stackaudit.ai"),

  title: {
    default: "StackAudit — AI Cost Intelligence",
    template: "%s | StackAudit",
  },

  description:
    "Understand AI workload costs across providers and models, attribute spend to workloads, and track cost per business outcome.",

  keywords: [
    "AI cost intelligence",
    "LLM cost tracking",
    "AI workload attribution",
    "cost per outcome",
    "AI usage analytics",
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
    title: "StackAudit — AI Cost Intelligence",
    description:
      "Track AI usage, provider costs, workloads, and business outcomes in a self-hostable dashboard.",

    url: "https://stackaudit.ai",
    siteName: "StackAudit",
    locale: "en_US",
    type: "website",

    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "StackAudit AI Cost Intelligence Dashboard",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "StackAudit — AI Cost Intelligence",
    description:
      "Track AI workload costs and business outcomes across providers.",

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
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        {children}
      </body>
    </html>
  );
}

