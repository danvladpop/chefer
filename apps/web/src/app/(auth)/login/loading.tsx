export default function LoginLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-32 animate-pulse rounded-lg bg-muted" />
          <div className="mx-auto h-7 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="mx-auto mt-2 h-4 w-64 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-10 w-full animate-pulse rounded-md bg-primary/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
