import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <span className="rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold text-primary">
        Premium Client Journey
      </span>
      <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">
        Launch the bilingual client hub that turns credit audits into revenue moments.
      </h1>
      <p className="text-base text-slate-600 sm:text-lg">
        Point a consumer to <code className="rounded bg-slate-900/5 px-2 py-1 font-mono text-sm">/portal/&lt;consumerId&gt;</code>
        {' '}and they will see personalized milestones, Metro-2 insights, and upgrade CTAs powered by your Express API.
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Link
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-card transition hover:brightness-110"
          href="/portal/demo-client"
        >
          Preview the Client Portal
        </Link>
        <a
          className="text-sm font-semibold text-slate-600 hover:text-primary"
          href="https://stripe.com/docs/payments/checkout"
          target="_blank"
          rel="noreferrer"
        >
          Add Stripe checkout →
        </a>
      </div>
      <p className="text-xs text-slate-500">
        Pro tip: AB test your hero CTA vs. an upsell banner tied to your certified mail add-on.
      </p>
    </main>
  );
}
