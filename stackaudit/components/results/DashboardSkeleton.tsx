export function DashboardSkeleton() {
  return (
    <div className="w-full max-w-5xl mx-auto animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="flex flex-col justify-center p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 h-[300px]">
          <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-32 mb-6"></div>
          <div className="h-16 bg-zinc-200 dark:bg-zinc-800 rounded w-48 mb-4"></div>
          <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded w-32"></div>
        </div>

        <div className="p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black h-[300px]">
          <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-48 mb-8"></div>
          <div className="space-y-4">
            <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded w-full"></div>
            <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4"></div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-64 mb-8"></div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex gap-6 h-40">
            <div className="size-12 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0"></div>
            <div className="flex-1 space-y-4">
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/4"></div>
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-full"></div>
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
