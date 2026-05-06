"use client";

import { motion } from "framer-motion";
import { Search, TrendingDown, Users, ShieldAlert } from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Shadow AI Discovery",
    description: "Detect unauthorized or individual AI tool subscriptions expensed via corporate cards before they become compliance risks.",
  },
  {
    icon: Users,
    title: "Seat Utilization Tracking",
    description: "Connect to GitHub Copilot, ChatGPT Enterprise, and Anthropic. See exactly which developers are actively using their assigned seats.",
  },
  {
    icon: TrendingDown,
    title: "Automated Offboarding",
    description: "Instantly revoke access to expensive AI licenses when contractors finish projects or employees leave the company.",
  },
  {
    icon: ShieldAlert,
    title: "Cost Anomaly Detection",
    description: "Get Slack alerts when API usage spikes unexpectedly or when team token consumption exceeds budget thresholds.",
  },
];

export function FeatureCards() {
  return (
    <section id="features" className="py-24 bg-zinc-50 dark:bg-zinc-900/20">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Total visibility into your AI stack
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Everything you need to govern AI spend, built for engineering and finance teams.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative p-8 rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-black transition-all hover:shadow-md"
            >
              <div className="size-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6">
                <feature.icon className="size-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
