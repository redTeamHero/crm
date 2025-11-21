"use client";

import clsx from 'clsx';
import { useMemo, useState } from 'react';
import type { BureauRuleGroup } from '@/lib/rule-debug';

type RuleDebugCopy = {
  ruleDebugTitle: string;
  ruleDebugSubtitle: string;
  ruleDebugBadge: string;
  ruleDebugEmpty: string;
  ruleDebugSeverity: string;
  ruleDebugCreditor: string;
  ruleDebugCode: string;
  ruleDebugCategory: string;
  ruleDebugSource: string;
  ruleDebugFields: string;
  ruleDebugNoDetail: string;
  ruleDebugUnknown: string;
  ruleDebugBureau: (bureau: string) => string;
  ruleDebugCardView: string;
  ruleDebugListView: string;
  ruleDebugExpand: string;
  ruleDebugCollapse: string;
};

type RuleDebugGridProps = {
  groups: BureauRuleGroup[];
  copy: RuleDebugCopy;
};

function severityTone(severity: number) {
  if (severity >= 3) {
    return 'border-rose-200 bg-rose-500/10 text-rose-600';
  }
  if (severity === 2) {
    return 'border-amber-200 bg-amber-500/10 text-amber-600';
  }
  return 'border-emerald-200 bg-emerald-500/10 text-emerald-600';
}

function formatSeverityLabel(label: string, severity: number) {
  if (!Number.isFinite(severity) || severity <= 0) {
    return `${label} —`;
  }
  return `${label} ${severity}`;
}

export default function RuleDebugGrid({ groups, copy }: RuleDebugGridProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const hasCards = groups?.some((group) => group.cards.length > 0) ?? false;

  const flatCards = useMemo(() => {
    return (
      groups?.flatMap((group) =>
        group.cards.map((card) => ({
          ...card,
          bureau: group.bureau,
          id: `${group.bureau}-${card.key}`,
        }))
      ) || []
    );
  }, [groups]);

  const handleToggle = (id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <section className="glass p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{copy.ruleDebugTitle}</h2>
          <p className="text-sm text-slate-600">{copy.ruleDebugSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge">{copy.ruleDebugBadge}</span>
          <div className="flex items-center rounded-full bg-slate-100 p-1 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={clsx(
                'rounded-full px-3 py-1 transition',
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {copy.ruleDebugCardView}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={clsx(
                'rounded-full px-3 py-1 transition',
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {copy.ruleDebugListView}
            </button>
          </div>
        </div>
      </div>

      {!hasCards ? (
        <p className="mt-6 text-sm text-slate-500">{copy.ruleDebugEmpty}</p>
      ) : viewMode === 'cards' ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {groups.map((group) => (
            <article key={group.bureau} className="glass flex h-full flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {copy.ruleDebugBureau(group.bureau)}
                </h3>
                <span className="rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {group.cards.length}
                </span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto pr-1 max-h-[32rem]">
                {group.cards.map((card) => (
                  <div
                    key={card.key}
                    className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                          {card.category || copy.ruleDebugCategory}
                        </p>
                        <h4 className="mt-1 text-sm font-semibold text-slate-900">
                          {card.title}
                        </h4>
                      </div>
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold',
                          severityTone(card.severity)
                        )}
                      >
                        {formatSeverityLabel(copy.ruleDebugSeverity, card.severity)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {card.detail || copy.ruleDebugNoDetail}
                    </p>
                    <dl className="mt-3 space-y-1 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <dt className="font-semibold text-slate-700">{copy.ruleDebugCategory}:</dt>
                        <dd className="truncate text-slate-500">
                          {card.category || copy.ruleDebugUnknown}
                        </dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <dt className="font-semibold text-slate-700">{copy.ruleDebugCreditor}:</dt>
                        <dd className="truncate text-slate-500">
                          {card.creditor || copy.ruleDebugUnknown}
                        </dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <dt className="font-semibold text-slate-700">{copy.ruleDebugCode}:</dt>
                        <dd className="truncate text-slate-500">{card.code}</dd>
                      </div>
                      {card.source && (
                        <div className="flex items-center gap-2">
                          <dt className="font-semibold text-slate-700">{copy.ruleDebugSource}:</dt>
                          <dd className="truncate text-slate-500">{card.source}</dd>
                        </div>
                      )}
                    </dl>
                    {card.fields.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {copy.ruleDebugFields}
                        </p>
                        <dl className="mt-2 space-y-1 text-xs text-slate-500">
                          {card.fields.map((field) => (
                            <div key={`${card.key}-${field.label}`} className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-600">{field.label}</dt>
                              <dd className="text-right text-slate-500">{field.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {flatCards.map((card) => {
            const isExpanded = Boolean(expanded[card.id]);
            return (
              <div key={card.id} className="rounded-2xl bg-white/90 p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => handleToggle(card.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      {card.category || copy.ruleDebugCategory}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">{card.title}</h4>
                      <span className="rounded-full bg-slate-900/5 px-2 py-1 text-[10px] font-semibold text-slate-600">
                        {copy.ruleDebugBureau(card.bureau)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{card.code}</p>
                  </div>
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold',
                      severityTone(card.severity)
                    )}
                  >
                    {formatSeverityLabel(copy.ruleDebugSeverity, card.severity)}
                  </span>
                </button>
                {isExpanded && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    <p>{card.detail || copy.ruleDebugNoDetail}</p>
                    <dl className="mt-3 space-y-2 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <dt className="font-semibold text-slate-700">{copy.ruleDebugCategory}:</dt>
                        <dd className="truncate text-slate-600">{card.category || copy.ruleDebugUnknown}</dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <dt className="font-semibold text-slate-700">{copy.ruleDebugCreditor}:</dt>
                        <dd className="truncate text-slate-600">{card.creditor || copy.ruleDebugUnknown}</dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <dt className="font-semibold text-slate-700">{copy.ruleDebugCode}:</dt>
                        <dd className="truncate text-slate-600">{card.code}</dd>
                      </div>
                      {card.source && (
                        <div className="flex items-center gap-2">
                          <dt className="font-semibold text-slate-700">{copy.ruleDebugSource}:</dt>
                          <dd className="truncate text-slate-600">{card.source}</dd>
                        </div>
                      )}
                    </dl>
                    {card.fields.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {copy.ruleDebugFields}
                        </p>
                        <dl className="mt-2 space-y-1 text-xs text-slate-500">
                          {card.fields.map((field) => (
                            <div key={`${card.id}-${field.label}`} className="flex justify-between gap-3">
                              <dt className="font-medium text-slate-600">{field.label}</dt>
                              <dd className="text-right text-slate-500">{field.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex justify-end text-xs font-semibold text-primary">
                  <button type="button" onClick={() => handleToggle(card.id)}>
                    {isExpanded ? copy.ruleDebugCollapse : copy.ruleDebugExpand}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
