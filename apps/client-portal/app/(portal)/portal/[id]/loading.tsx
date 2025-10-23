export default function PortalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="glass flex flex-col items-center gap-3 px-8 py-6 text-center text-slate-600">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary"></span>
        <p className="text-sm font-medium">Preparing your Metro-2 insights…</p>
        <p className="text-xs text-slate-500">We are syncing dispute milestones and invoices.</p>
      </div>
    </div>
  );
}
