import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return (
    <div className="container mx-auto py-12 px-4 min-h-screen flex flex-col items-center">
      <div className="mb-10 text-center space-y-4 max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-green-600 dark:text-green-500">
          Audit Complete
        </h1>
        <p className="text-xl text-muted-foreground">
          Your audit (ID: {resolvedParams.id}) has been successfully generated. 
        </p>
      </div>

      <div className="w-full max-w-4xl p-8 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-black shadow-sm text-center">
        <h2 className="text-2xl font-semibold mb-4">Results Dashboard</h2>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          The engine has processed your data. We are preparing the full savings breakdown.
        </p>
        
        <div className="flex justify-center gap-4">
          <Button asChild variant="outline">
            <Link href="/audit">Run Another Audit</Link>
          </Button>
          <Button asChild>
            <Link href="/">Return Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
