'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { translations, type LanguageKey } from '@/lib/translations';
import type { PortalPayload } from '@/lib/types';
import { formatCurrency, formatDate, formatTimeAgo } from '@/lib/format';
import { buildRuleGroups } from '@/lib/rule-debug';
import RuleDebugGrid from './RuleDebugGrid';

const DEFAULT_BACKGROUND = 'radial-gradient(circle at top left, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.08))';

function toScoreEntries(score: PortalPayload['creditScore']) {
  if (!score || typeof score !== 'object') return [] as Array<{ bureau: string; value: number }>;
  return Object.entries(score)
    .filter(([key, value]) => typeof value === 'number' && ['transunion', 'experian', 'equifax'].includes(key.toLowerCase()))
    .map(([bureau, value]) => ({ bureau, value: value as number }));
}

function moduleEnabled(modules: Record<string, boolean>, key: string) {
  if (!modules) return true;
  if (!(key in modules)) return true;
  return Boolean(modules[key]);
}

function safeList<T>(value: T[] | undefined | null, limit: number) {
  if (!Array.isArray(value) || value.length === 0) return [] as T[];
  return value.slice(0, limit);
}

export default function PortalDashboard({ portal }: { portal: PortalPayload }) {
  const [language, setLanguage] = useState<LanguageKey>('en');
  const copy = translations[language];
  const theme = portal.portalSettings?.theme || {};
  const modules = portal.portalSettings?.modules || {};
  const background = theme.backgroundColor || DEFAULT_BACKGROUND;

  const scoreEntries = useMemo(() => toScoreEntries(portal.creditScore), [portal.creditScore]);
  const disputeCount = portal.negativeItems?.length ?? 0;
  const openBalance = useMemo(
    () => portal.invoices?.filter((invoice) => !invoice.paid).reduce((sum, invoice) => sum + (invoice.amount || 0), 0) ?? 0,
    [portal.invoices]
  );
  const openInvoices = safeList(portal.invoices, 5);
  const timeline = safeList(portal.timeline, 6);
  const documents = safeList(portal.documents, 4);
  const reminders = safeList(portal.reminders, 3);
  const messages = safeList(portal.messages, 4);
  const ruleGroups = useMemo(() => buildRuleGroups(portal.negativeItems), [portal.negativeItems]);

  const handleLanguageToggle = () => {
    setLanguage((prev) => (prev === 'en' ? 'es' : 'en'));
  };

  const heroCopy = useMemo(
    () => ({
      welcome: copy.welcome(portal.consumer.name),
      subheading: copy.subheading,
    }),
    [copy, portal.consumer.name]
  );

  return (
    <div style={{ background }} className="min-h-screen pb-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <header className="glass flex flex-col gap-6 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {theme.logoUrl ? (
              <Image
                src={theme.logoUrl}
                alt="Company logo"
                width={56}
                height={56}
                className="h-14 w-14 rounded-2xl bg-white/70 object-contain p-2"
                unoptimized
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-white">
                Portal
              </div>
            )}
            <div className="flex flex-col gap-1 text-left">
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{heroCopy.welcome}</h1>
              <p className="text-sm text-slate-600 sm:text-base">{heroCopy.subheading}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600">
              {translations[language].languageLabel}
            </span>
            <button
              type="button"
              onClick={handleLanguageToggle}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-primary hover:text-primary"
            >
              {copy.toggleLabel}
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="stat-card md:col-span-2">
            <span className="badge">{copy.kpiHeadline}</span>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-900 p-5 text-white">
                <p className="text-xs uppercase tracking-wide text-white/70">{copy.creditScore}</p>
                <div className="mt-2 flex items-end gap-3">
                  <span className="text-4xl font-semibold">
                    {scoreEntries.length ? scoreEntries[0].value : '—'}
                  </span>
                  <span className="text-xs text-white/70">
                    {scoreEntries.length ? scoreEntries[0].bureau : ''}
                  </span>
                </div>
                <p className="mt-4 text-[11px] text-white/70">
                  {language === 'es'
                    ? 'Sugerencia: muestra el progreso por buró para reforzar confianza.'
                    : 'Tip: show bureau-level progress to reinforce trust.'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/90 p-5 shadow-card">
                <p className="text-xs uppercase tracking-wide text-slate-500">{copy.disputes}</p>
                <div className="mt-2 text-4xl font-semibold text-slate-900">{disputeCount}</div>
                <p className="mt-4 text-[11px] text-slate-500">
                  {language === 'es'
                    ? 'Destaca qué corrección desbloquea el siguiente hito.'
                    : 'Highlight which correction unlocks the next milestone.'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/90 p-5 shadow-card">
                <p className="text-xs uppercase tracking-wide text-slate-500">{copy.payments}</p>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{formatCurrency(openBalance, language === 'es' ? 'es-US' : 'en-US')}</div>
                <p className="mt-4 text-[11px] text-slate-500">
                  {language === 'es'
                    ? 'Configura un CTA para pagos recurrentes con Stripe Checkout.'
                    : 'Drop a CTA for recurring payments via Stripe Checkout.'}
                </p>
              </div>
            </div>
          </article>
          <aside className="glass flex flex-col justify-between gap-4 p-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{copy.planCta}</h3>
              <p className="mt-2 text-sm text-slate-600">{copy.planCopy}</p>
            </div>
            <a
              href={openInvoices[0]?.payLink || '#payments'}
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:brightness-110"
            >
              {copy.educationCta}
            </a>
            <p className="text-xs text-slate-500">{copy.analyticsTip}</p>
          </aside>
        </section>

        {moduleEnabled(modules, 'messages') && (
          <section className="grid gap-4 md:grid-cols-2">
            <article className="glass p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{copy.messages}</h2>
                <span className="badge">NEPQ</span>
              </div>
              <div className="mt-4 space-y-3">
                {messages.length === 0 && <p className="text-sm text-slate-500">{copy.empty}</p>}
                {messages.map((message) => (
                  <div key={message.id} className="rounded-2xl bg-white/80 p-4 shadow-sm">
                    <p className="text-sm text-slate-700">{message.message}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{message.actor || 'Advisor'}</span>
                      <span>{formatTimeAgo(message.at, language === 'es' ? 'es-US' : 'en-US')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className="glass p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{copy.reminders}</h2>
                <span className="badge">{copy.nextStep}</span>
              </div>
              <div className="mt-4 space-y-3">
                {reminders.length === 0 && <p className="text-sm text-slate-500">{copy.empty}</p>}
                {reminders.map((reminder) => (
                  <div key={reminder.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <p className="font-semibold text-slate-800">{reminder.title || copy.nextStep}</p>
                    <p className="text-xs text-slate-500">{formatDate(reminder.due, language === 'es' ? 'es-US' : 'en-US')}</p>
                    {reminder.note && <p className="mt-2 text-sm text-slate-600">{reminder.note}</p>}
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          {moduleEnabled(modules, 'documents') && (
            <article className="glass p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{copy.documents}</h2>
                <span className="badge">Uploads</span>
              </div>
              <div className="mt-4 space-y-3">
                {documents.length === 0 && <p className="text-sm text-slate-500">{copy.empty}</p>}
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{doc.name}</p>
                      <p className="text-xs text-slate-500">{formatDate(doc.uploadedAt, language === 'es' ? 'es-US' : 'en-US')}</p>
                    </div>
                    {doc.url && (
                      <a
                        href={doc.url}
                        className="text-xs font-semibold text-primary"
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </article>
          )}

          {moduleEnabled(modules, 'payments') && (
            <article className="table-card p-0">
              <div className="flex items-center justify-between px-6 pt-6">
                <h2 className="text-lg font-semibold text-slate-900">{copy.payments}</h2>
                <span className="badge">{copy.invoicesCta}</span>
              </div>
              <div className="overflow-x-auto px-6 pb-6">
                {openInvoices.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">{copy.empty}</p>
                ) : (
                  <table className="mt-4">
                    <thead>
                      <tr>
                        <th>{language === 'es' ? 'Descripción' : 'Description'}</th>
                        <th>{language === 'es' ? 'Monto' : 'Amount'}</th>
                        <th>{language === 'es' ? 'Vence' : 'Due'}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {openInvoices.map((invoice) => (
                        <tr key={invoice.id} className="odd:bg-white/70">
                          <td className="font-medium text-slate-700">{invoice.description}</td>
                          <td>{invoice.amountFormatted || formatCurrency(invoice.amount)}</td>
                          <td>{formatDate(invoice.due, language === 'es' ? 'es-US' : 'en-US')}</td>
                          <td className="text-right">
                            {invoice.payLink && (
                              <a
                                href={invoice.payLink}
                                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
                              >
                                {copy.payNow}
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </article>
          )}
        </section>

        <RuleDebugGrid groups={ruleGroups} copy={copy} />

        <section className="glass p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{copy.timeline}</h2>
            <span className="badge">Metro-2</span>
          </div>
          <div className="mt-4 space-y-4">
            {timeline.length === 0 && <p className="text-sm text-slate-500">{copy.empty}</p>}
            {timeline.map((event) => (
              <div key={event.id} className="flex items-start gap-4 rounded-2xl bg-white/80 p-4 shadow-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{event.title || event.type}</span>
                    <span className="text-xs text-slate-500">{formatDate(event.at, language === 'es' ? 'es-US' : 'en-US')}</span>
                  </div>
                  {event.message && <p className="mt-1 text-sm text-slate-600">{event.message}</p>}
                  {event.link && (
                    <a href={event.link} className="text-xs font-semibold text-primary" target="_blank" rel="noreferrer">
                      {language === 'es' ? 'Abrir recurso' : 'Open resource'}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
