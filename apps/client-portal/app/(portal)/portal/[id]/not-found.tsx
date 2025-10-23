import Link from 'next/link';

export default function PortalNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-6 text-center">
      <div className="glass px-8 py-10">
        <h1 className="text-3xl font-semibold text-slate-900">Portal not available</h1>
        <p className="mt-3 text-sm text-slate-600">
          We could not locate that client record. Confirm the link was shared from your CRM or send your client a fresh invite.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white shadow-card hover:brightness-110"
        >
          Back to overview
        </Link>
      </div>
    </main>
  );
}
