'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const [crmUrl, setCrmUrl] = useState('http://localhost:3000');

  useEffect(() => {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    // For Replit, the CRM is on another port which means a different subdomain/URL in the proxy
    // Replit format: https://[guid]-00-[random].janeway.replit.dev
    // Port 3000 is usually not directly accessible via the same domain.
    // However, if we're on Replit, we can try to guess the 3000 port URL or just use the local relative one if proxied.
    // For now, let's use a relative path if possible, but Express is on 3000.
    // Replit allows multiple ports by using the format: slug-port.user.repl.co (old)
    // or through the janeway proxy which maps ports.
    
    if (host.includes('replit.dev')) {
       // Heuristic: swap the first part of the domain to include the port if Replit supports it
       // Or just assume the user will access it via the Replit interface.
       // The best way in Replit is to use the specific port URL.
       const parts = host.split('.');
       const slug = parts[0];
       // Replace the 5000 port part if it exists or append
       // Actually Replit Janeway uses a specific URL for each port.
       // We'll leave it as localhost for now but mention it's internal.
    }
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-12 px-6 py-16 text-center">
      <div className="space-y-4">
        <span className="rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold text-primary">
          Metro2 CRM Ecosystem
        </span>
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
          Complete Credit Management Solution
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-600">
          Access the specialized portal for clients or the comprehensive CRM dashboard for administrators and staff.
        </p>
      </div>

      <div className="grid w-full gap-8 sm:grid-cols-2">
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition hover:shadow-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">Client Portal</h2>
            <p className="text-slate-600">
              For consumers to upload reports, track progress, and view dispute results.
            </p>
          </div>
          <Link
            className="w-full rounded-xl bg-primary px-6 py-4 text-center text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            href="/portal/demo-client"
          >
            Go to Client Side
          </Link>
        </div>

        <div className="flex flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition hover:shadow-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12a2.25 2.25 0 0 1 2.25 2.25V21M3 3V2.25A2.25 2.25 0 0 1 5.25 0h7.5A2.25 2.25 0 0 1 15 2.25V3m3 4.5h3a2.25 2.25 0 0 1 2.25 2.25V21" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">CRM Dashboard</h2>
            <p className="text-slate-600">
              For administrators to manage clients, process audits, and generate letters.
            </p>
          </div>
          <a
            className="w-full rounded-xl bg-slate-900 px-6 py-4 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            href={`https://${window.location.hostname.replace('-5000', '-3000')}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Go to CRM Side
          </a>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        Note: The CRM Side requires the backend server to be running on port 3000.
      </p>
    </main>
  );
}
