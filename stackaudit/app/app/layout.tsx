'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LayoutDashboard, Server, Activity, Target, ShieldAlert, Settings, Bell } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Quick probe to check if the user has an org set up.
    // If Dashboard summary throws a 403, we redirect to onboarding.
    fetch('/api/v1/dashboard/summary?start=2024-01-01&end=2024-12-31')
      .then(res => {
        if (res.status === 403) router.push('/onboarding');
      })
      .catch(() => {});
  }, [router]);
  return (
    <div className="flex h-screen bg-background text-base">
      {/* Sidebar */}
      <aside className="w-72 border-r border-border bg-sidebar flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-border text-xl font-semibold tracking-tight text-foreground">
          AI Cost Intelligence
        </div>
        <nav className="flex-1 p-4 space-y-1.5">
          <NavItem href="/app/dashboard" icon={LayoutDashboard}>Overview</NavItem>
          <NavItem href="/app/workloads" icon={Server}>Workloads</NavItem>
          <NavItem href="/app/usage" icon={Activity}>Usage</NavItem>
          <NavItem href="/app/outcomes" icon={Target}>Outcomes</NavItem>
          <NavItem href="/app/audits" icon={ShieldAlert}>Audits</NavItem>
          <NavItem href="/app/alerts" icon={Bell}>Alerts</NavItem>
        </nav>
        <div className="p-4 border-t border-border">
          <NavItem href="/app/settings" icon={Settings}>Settings</NavItem>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-border bg-background flex items-center px-6 justify-between shrink-0">
          <div className="font-medium text-foreground hidden md:block">Organization Dashboard</div>
          <div className="flex items-center space-x-4">
            {/* Global Date Range Picker replaced by page-level selectors */}
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center px-3 py-2.5 text-foreground/80 hover:bg-secondary hover:text-foreground rounded-xl transition-colors font-medium">
      <Icon className="w-5 h-5 mr-3 opacity-80 stroke-[1.5]" />
      {children}
    </Link>
  );
}
