import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 py-12 bg-white dark:bg-black">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center space-x-2 mb-4">
              <div className="size-6 rounded bg-blue-600 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 text-white"
                >
                  <path d="M2 20h.01" />
                  <path d="M7 20v-4" />
                  <path d="M12 20v-8" />
                  <path d="M17 20V8" />
                  <path d="M22 4v16" />
                </svg>
              </div>
              <span className="font-semibold tracking-tight">StackAudit</span>
            </Link>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              AI Spend Optimization for Modern Engineering Teams.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Product</h3>
            <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
              <li><Link href="#features" className="hover:text-zinc-900 dark:hover:text-zinc-100">Features</Link></li>
              <li><Link href="#pricing" className="hover:text-zinc-900 dark:hover:text-zinc-100">Pricing</Link></li>
              <li><Link href="/integrations" className="hover:text-zinc-900 dark:hover:text-zinc-100">Integrations</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Company</h3>
            <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
              <li><Link href="/about" className="hover:text-zinc-900 dark:hover:text-zinc-100">About Us</Link></li>
              <li><Link href="/blog" className="hover:text-zinc-900 dark:hover:text-zinc-100">Blog</Link></li>
              <li><Link href="/contact" className="hover:text-zinc-900 dark:hover:text-zinc-100">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
              <li><Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500 dark:text-zinc-400 flex flex-col md:flex-row items-center justify-between">
          <p>© {new Date().getFullYear()} StackAudit, Inc. All rights reserved.</p>
          <div className="flex gap-4 mt-4 md:mt-0">
            <Link href="https://twitter.com/stackaudit" className="hover:text-zinc-900 dark:hover:text-zinc-100">Twitter</Link>
            <Link href="https://github.com/stackaudit" className="hover:text-zinc-900 dark:hover:text-zinc-100">GitHub</Link>
            <Link href="https://linkedin.com/company/stackaudit" className="hover:text-zinc-900 dark:hover:text-zinc-100">LinkedIn</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
