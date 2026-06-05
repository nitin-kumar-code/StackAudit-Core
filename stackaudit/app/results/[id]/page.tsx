import { ResultsClient } from '@/components/results/ResultsClient';

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  
  return (
    <div className="container mx-auto py-12 px-4 min-h-screen">
      <div className="mb-12 text-center space-y-4 max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-zinc-900 dark:text-white">
          Audit Dashboard
        </h1>
        <p className="text-xl text-muted-foreground">
          Report ID: <span className="font-mono text-sm bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded">{resolvedParams.id}</span>
        </p>
      </div>

      <ResultsClient />
    </div>
  );
}
