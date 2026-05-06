export function TestimonialsSection() {
  return (
    <section className="py-24 border-y border-zinc-200 dark:border-zinc-800">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Trusted by modern engineering teams</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Join forward-thinking companies optimizing their AI spend.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Placeholder for testimonials */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col justify-between p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50">
              <p className="text-zinc-700 dark:text-zinc-300 italic mb-6">
                "StackAudit discovered $12,000 in unused Copilot seats within our first week. It paid for itself immediately."
              </p>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div>
                  <div className="font-semibold text-sm">Jane Doe</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">VP of Engineering, Startup Inc.</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
