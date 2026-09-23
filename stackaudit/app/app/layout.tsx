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
    <div className="flex h-screen bg-[#f9fafb] text-sm">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-white flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b font-medium tracking-tight">
          AI Cost Intelligence
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavItem href="/app/dashboard" icon={LayoutDashboard}>Overview</NavItem>
          <NavItem href="/app/workloads" icon={Server}>Workloads</NavItem>
          <NavItem href="/app/usage" icon={Activity}>Usage</NavItem>
          <NavItem href="/app/outcomes" icon={Target}>Outcomes</NavItem>
          <NavItem href="/app/audits" icon={ShieldAlert}>Audits</NavItem>
          <NavItem href="/app/alerts" icon={Bell}>Alerts</NavItem>
        </nav>
        <div className="p-4 border-t">
          <NavItem href="/app/settings" icon={Settings}>Settings</NavItem>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b bg-white flex items-center px-6 justify-between shrink-0">
          <div className="font-medium text-gray-800 hidden md:block">Organization Dashboard</div>
          <div className="flex items-center space-x-4">
            {/* Global Date Range Picker placeholder */}
            <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded">
              Last 90 Days
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
      <Icon className="w-4 h-4 mr-3 text-gray-400" />
      {children}
    </Link>
  );
}
