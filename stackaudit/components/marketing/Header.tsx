import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/50 bg-white/50 backdrop-blur-xl supports-[backdrop-filter]:bg-white/50 dark:border-zinc-800/50 dark:bg-black/20">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center space-x-2">
            <div className="size-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 text-white"
              >
                <path d="M2 20h.01" />
                <path d="M7 20v-4" />
                <path d="M12 20v-8" />
                <path d="M17 20V8" />
                <path d="M22 4v16" />
              </svg>
            </div>
            <span className="font-semibold text-lg tracking-tight">StackAudit</span>
          </Link>
          <nav className="hidden md:flex gap-6 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="#features" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Features
            </Link>
            <Link href="#pricing" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Pricing
            </Link>
            <Link href="#faq" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              FAQ
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 sm:block">
            Sign in
          </Link>
          <Button size="sm" className="rounded-full">
            <Link href="/dashboard">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
