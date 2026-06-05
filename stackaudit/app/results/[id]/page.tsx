import { ResultsClient } from '@/components/results/ResultsClient';
import { ShareButton } from '@/components/results/ShareButton';
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stackaudit.app';
  
  return {
    title: `Audit Report ${resolvedParams.id} | StackAudit`,
    description: `We found thousands in potential savings for this AI stack. View the fully anonymized StackAudit report.`,
    openGraph: {
      title: `AI Spend Audit Report - ${resolvedParams.id}`,
      description: `View the optimization report and see how much can be saved by eliminating redundant AI tools and unused seats.`,
      url: `${baseUrl}/results/${resolvedParams.id}`,
      siteName: 'StackAudit',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `AI Spend Audit Report - ${resolvedParams.id}`,
      description: `We found thousands in potential savings for this AI stack. View the report.`,
    }
  };
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  
  return (
    <div className="container mx-auto py-12 px-4 min-h-screen">
      <div className="mb-12 relative flex flex-col items-center max-w-4xl mx-auto">
        <div className="w-full flex justify-end absolute top-0 right-0">
          <ShareButton />
        </div>
        <div className="text-center space-y-4 max-w-2xl mt-4 sm:mt-0">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-zinc-900 dark:text-white">
            Audit Dashboard
          </h1>
          <p className="text-xl text-muted-foreground">
            Report ID: <span className="font-mono text-sm bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded">{resolvedParams.id}</span>
          </p>
        </div>
      </div>

      <ResultsClient reportId={resolvedParams.id} />
    </div>
  );
}
