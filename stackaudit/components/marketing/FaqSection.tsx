"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    question: "How does StackAudit track AI tool usage?",
    answer: "We connect directly to your identity provider (Okta, Google Workspace) and the APIs of supported AI tools (GitHub, OpenAI, Anthropic). We cross-reference provisioned seats with actual API or platform activity to identify unused licenses.",
  },
  {
    question: "Is my source code or prompt data safe?",
    answer: "Yes. StackAudit only requests metadata and billing access scopes. We never have access to your source code, model prompts, or any proprietary data passing through the AI tools.",
  },
  {
    question: "Can it automatically cancel subscriptions?",
    answer: "For supported platforms, we can automatically de-provision users based on inactivity rules you define. For individual corporate card expenses, we alert the user and manager to initiate cancellation.",
  },
  {
    question: "How long does setup take?",
    answer: "Most teams are up and running in under 15 minutes. Connect your IdP, link your GitHub organization, and we'll instantly generate your first savings report.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-zinc-50 dark:bg-zinc-900/20">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Frequently Asked Questions</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Everything you need to know about StackAudit.</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div 
              key={index}
              className="border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-black overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="flex items-center justify-between w-full p-6 text-left"
              >
                <span className="font-medium">{faq.question}</span>
                <ChevronDown 
                  className={`size-5 text-zinc-500 transition-transform duration-200 ${openIndex === index ? 'rotate-180' : ''}`} 
                />
              </button>
              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="px-6 pb-6 text-zinc-600 dark:text-zinc-400">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
