'use client';

import { useMemo, useState } from 'react';

const statusSteps = [
  { label: 'Report received', date: 'Sep 12, 2024', status: 'complete' },
  { label: 'Parsing', date: 'Sep 13, 2024', status: 'complete' },
  { label: 'Findings ready', date: 'Sep 14, 2024', status: 'current' },
  { label: 'Dispute packet ready', date: 'Sep 15, 2024', status: 'upcoming' },
  { label: 'Sent', date: 'Sep 18, 2024', status: 'upcoming' },
  { label: 'Awaiting results', date: 'Oct 2, 2024', status: 'upcoming' },
];

const findingsData = [
  {
    bureau: 'TransUnion',
    furnishers: [
      {
        name: 'Midwest Collections',
        severity: 'High',
        rule: '15 USC 1681s-2(b)',
        explanation: 'Account marked as delinquent after dispute without investigation.',
        evidence: ['Balance updated 08/01 without notice', 'No dispute response on file'],
      },
      {
        name: 'Prime Auto Finance',
        severity: 'Medium',
        rule: 'FCRA § 623(a)(5)',
        explanation: 'Past-due date reported without a 30-day late payment notice.',
        evidence: ['Past due date 07/15', 'Customer notice missing'],
      },
    ],
  },
  {
    bureau: 'Experian',
    furnishers: [
      {
        name: 'Summit Health',
        severity: 'High',
        rule: 'FCRA § 605(a)',
        explanation: 'Medical collection appears outside the reporting window.',
        evidence: ['Date of service 2016', 'Collection opened 2024'],
      },
    ],
  },
  {
    bureau: 'Equifax',
    furnishers: [
      {
        name: 'Legacy Bankcard',
        severity: 'Low',
        rule: 'FCRA § 611(a)(5)',
        explanation: 'Inconsistent payment history between bureau and furnisher.',
        evidence: ['EQ shows 30-day late', 'Furnisher shows current'],
      },
    ],
  },
];

const disputePackets = [
  {
    title: 'Bureau dispute packets',
    items: [
      { name: 'TransUnion packet', method: 'Online upload', eta: 'Ready now' },
      { name: 'Experian packet', method: 'Certified mail', eta: 'Ready now' },
      { name: 'Equifax packet', method: 'Certified mail', eta: 'Ready in 1 day' },
    ],
  },
  {
    title: 'Furnisher / collector packets',
    items: [
      { name: 'Midwest Collections packet', method: 'Certified mail', eta: 'Ready now' },
      { name: 'Prime Auto Finance packet', method: 'Certified mail', eta: 'Ready in 2 days' },
    ],
  },
];

const timelineItems = [
  {
    title: 'Report uploaded',
    detail: 'IdentityIQ report HTML uploaded by client.',
    date: 'Sep 12, 2024',
  },
  {
    title: 'Parsing completed',
    detail: 'Metro-2 tradelines parsed and normalized.',
    date: 'Sep 13, 2024',
  },
  {
    title: 'Findings delivered',
    detail: '8 violations identified across 3 bureaus.',
    date: 'Sep 14, 2024',
  },
  {
    title: 'Draft dispute ready',
    detail: 'Review dispute packets and approve to send.',
    date: 'Sep 15, 2024',
  },
];

export default function SelfServePortal() {
  const [selectedFindings, setSelectedFindings] = useState<Record<string, boolean>>({});

  const totalFindings = useMemo(
    () => findingsData.reduce((sum, bureau) => sum + bureau.furnishers.length, 0),
    []
  );

  const includedCount = useMemo(
    () => Object.values(selectedFindings).filter(Boolean).length,
    [selectedFindings]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center">
          <div className="flex-1 space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1 text-xs font-semibold text-emerald-700">
              Multi-tenant client portal
            </span>
            <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
              Securely guide every client from report upload to dispute delivery.
            </h1>
            <p className="text-sm text-slate-600 sm:text-base">
              Each client logs in with a magic link or code, sees only their own cases, and can track dispute status in real
              time.
            </p>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm">
                Request magic link
              </button>
              <button className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700">
                Send SMS code
              </button>
            </div>
          </div>
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Client login</h2>
            <p className="mt-2 text-sm text-slate-500">We’ll email a secure link to access your portal.</p>
            <label className="mt-4 block text-xs font-semibold text-slate-500">Email address</label>
            <input
              type="email"
              placeholder="client@acmecredit.com"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <label className="mt-4 block text-xs font-semibold text-slate-500">Verification code</label>
            <input
              type="text"
              placeholder="123 456"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button className="mt-5 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">
              Enter portal
            </button>
            <p className="mt-3 text-xs text-slate-500">Admins can impersonate any tenant from the CRM.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Case dashboard</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Status across IdentityIQ reports, findings, and dispute packets for Tenant: <span className="font-semibold">Acme Credit</span>.
                </p>
              </div>
              <button className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white">
                Upload report
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {statusSteps.map((step) => (
                <div key={step.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-400">
                    <span>{step.status}</span>
                    <span>{step.date}</span>
                  </div>
                  <p className="mt-3 text-base font-semibold text-slate-900">{step.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Report upload</h3>
              <p className="mt-2 text-sm text-slate-500">Upload an IdentityIQ HTML or PDF report to start parsing.</p>
              <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-sm font-semibold text-slate-700">Drop file here or click to upload</p>
                <p className="text-xs text-slate-500">storage/tenant_acme/case_019/report.html</p>
                <div className="mx-auto flex flex-wrap items-center justify-center gap-3">
                  <button className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
                    Select file
                  </button>
                  <button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700">
                    Upload PDF
                  </button>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-slate-100 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">Parsing progress</p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
                  <div className="h-full w-3/4 rounded-full bg-emerald-500" />
                </div>
                <p className="mt-3 text-xs text-emerald-700">Last parsed 2 hours ago · parse_v3</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Findings overview</h3>
              <p className="mt-2 text-sm text-slate-500">{includedCount} of {totalFindings} findings included in dispute.</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Violations identified</p>
                    <p className="text-xs text-slate-500">Across TransUnion, Experian, Equifax</p>
                  </div>
                  <span className="text-xl font-semibold text-slate-900">8</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Next response due</p>
                    <p className="text-xs text-slate-500">Bureau response window</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">Oct 14</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Findings</h3>
            <p className="mt-2 text-sm text-slate-500">Group by bureau → furnisher → severity.</p>
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              {findingsData.map((bureau) => (
                <div key={bureau.bureau} className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900">{bureau.bureau}</h4>
                  {bureau.furnishers.map((finding) => {
                    const key = `${bureau.bureau}-${finding.name}`;
                    return (
                      <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{finding.name}</p>
                            <p className="text-xs text-slate-500">{finding.rule}</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                            {finding.severity}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">{finding.explanation}</p>
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
                          {finding.evidence.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                        <label className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedFindings[key])}
                            onChange={(event) =>
                              setSelectedFindings((prev) => ({
                                ...prev,
                                [key]: event.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          Include in dispute
                        </label>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Dispute builder</h3>
              <p className="mt-2 text-sm text-slate-500">
                Generate bureau and furnisher packets with mailing labels, instructions, and PDFs.
              </p>
              <div className="mt-6 space-y-6">
                {disputePackets.map((section) => (
                  <div key={section.title}>
                    <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4>
                    <div className="mt-3 space-y-3">
                      {section.items.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                            <p className="text-xs text-slate-500">{item.method}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-slate-500">{item.eta}</span>
                            <button className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                              Download PDF
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Timeline & responses</h3>
              <p className="mt-2 text-sm text-slate-500">Track what was sent, response due dates, and outcomes.</p>
              <div className="mt-6 space-y-4">
                {timelineItems.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                      <span>{item.date}</span>
                      <span>Event</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-2 text-xs text-slate-500">{item.detail}</p>
                  </div>
                ))}
              </div>
              <button className="mt-6 w-full rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600">
                Add response outcome
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
