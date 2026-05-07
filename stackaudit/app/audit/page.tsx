import AuditForm from '@/components/audit-form/AuditForm';

export const metadata = {
  title: 'AI Spend Audit | StackAudit',
  description: 'Audit your AI tools and find optimization opportunities.',
};

export default function AuditPage() {
  return (
    <div className="container mx-auto py-12 px-4 min-h-screen flex flex-col items-center">
      <div className="mb-10 text-center space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">AI Spend Audit</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Complete the form below to audit your team's AI tooling, identify redundancies, and optimize your monthly spend.
        </p>
      </div>
      
      <div className="w-full max-w-4xl">
        <AuditForm />
      </div>
    </div>
  );
}
