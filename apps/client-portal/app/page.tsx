import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <span className="rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold text-primary">
        Multi-tenant Client Journey
      </span>
      <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">
        Launch the self-serve client hub that keeps every tenant on track.
      </h1>
      <p className="text-base text-slate-600 sm:text-lg">
        Share the secure portal at <code className="rounded bg-slate-900/5 px-2 py-1 font-mono text-sm">/portal</code>
        {' '}so each client can upload reports, review findings, and build disputes without leaving their account.
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Link
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-card transition hover:brightness-110"
          href="/portal"
        >
          Preview the Client Portal
        </Link>
        <Link
          className="text-sm font-semibold text-slate-600 hover:text-primary"
          href="/portal/demo-client"
        >
          View legacy consumer view →
        </Link>
      </div>
      <p className="text-xs text-slate-500">
        Pro tip: assign each tenant_id to their own portal login and isolate uploads under storage/&lt;tenant_id&gt;.
      </p>
    </main>
  );
}
