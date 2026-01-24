import type { PortalNegativeItem, PortalViolation } from './types';

const DEFAULT_BUREAUS = ['TransUnion', 'Experian', 'Equifax'] as const;

export type BureauFieldHighlight = {
  label: string;
  value: string;
};

export type BureauRuleCard = {
  key: string;
  bureau: string;
  title: string;
  detail: string;
  code: string;
  severity: number;
  category?: string | null;
  creditor?: string | null;
  source?: string | null;
  disputeReason?: string | null;
  fcraSection?: string | null;
  recommendedAction?: string | null;
  fields: BureauFieldHighlight[];
};

export type BureauRuleGroup = {
  bureau: string;
  cards: BureauRuleCard[];
};

const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  account_number: 'Account #',
  payment_status: 'Payment Status',
  account_status: 'Account Status',
  past_due: 'Past Due',
  balance: 'Balance',
  credit_limit: 'Credit Limit',
  high_credit: 'High Credit',
  last_reported: 'Last Reported',
  date_opened: 'Date Opened',
  date_last_payment: 'Last Payment',
  date_first_delinquency: 'DOFD',
};

const HIGHLIGHT_FIELD_ORDER = [
  'account_number',
  'payment_status',
  'account_status',
  'past_due',
  'balance',
  'credit_limit',
  'high_credit',
  'last_reported',
  'date_last_payment',
  'date_first_delinquency',
];

const BUREAU_ALIAS_ENTRIES: Array<[RegExp, string]> = [
  [/trans\s*-?union|\btu\b|\btuc\b/i, 'TransUnion'],
  [/experian|\bexp\b/i, 'Experian'],
  [/equifax|\beqf\b|\beqx\b/i, 'Equifax'],
];

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+|_/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function formatFieldLabel(field: string): string {
  if (FIELD_LABEL_OVERRIDES[field]) return FIELD_LABEL_OVERRIDES[field];
  return toTitleCase(field);
}

function normalizeBureauName(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;
  for (const [pattern, name] of BUREAU_ALIAS_ENTRIES) {
    if (pattern.test(trimmed)) {
      return name;
    }
  }
  const normalized = trimmed.replace(/\s+/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function ensureBureau(map: Map<string, Map<string, BureauRuleCard>>, bureau: string) {
  if (!map.has(bureau)) {
    map.set(bureau, new Map());
  }
}

function resolveSeverity(violation: PortalViolation | string, item: PortalNegativeItem): number {
  const candidates = [] as Array<number | null | undefined>;
  if (typeof violation !== 'string') {
    candidates.push(violation?.severity);
  }
  candidates.push(item.metrics?.maxSeverity, item.severity);
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return 1;
}

function collectBureaus(violation: PortalViolation | string, item: PortalNegativeItem): string[] {
  const bureaus = new Set<string>();
  if (typeof violation !== 'string') {
    if (Array.isArray(violation?.bureaus)) {
      violation.bureaus.forEach((bureau) => {
        const normalized = normalizeBureauName(bureau);
        if (normalized) bureaus.add(normalized);
      });
    }
    if (violation?.bureau) {
      const normalized = normalizeBureauName(violation.bureau);
      if (normalized) bureaus.add(normalized);
    }
  }
  if (Array.isArray(item.bureaus)) {
    item.bureaus.forEach((bureau) => {
      const normalized = normalizeBureauName(bureau);
      if (normalized) bureaus.add(normalized);
    });
  }
  return Array.from(bureaus);
}

function extractHighlights(details: Record<string, string> | undefined): BureauFieldHighlight[] {
  if (!details) return [];
  const highlights: BureauFieldHighlight[] = [];
  for (const field of HIGHLIGHT_FIELD_ORDER) {
    const value = details[field];
    if (!value) continue;
    highlights.push({ label: formatFieldLabel(field), value });
    if (highlights.length >= 6) return highlights;
  }
  if (highlights.length) return highlights;
  const fallback = Object.entries(details)
    .filter(([key, value]) => Boolean(key) && Boolean(value))
    .slice(0, 6)
    .map(([key, value]) => ({ label: formatFieldLabel(key), value }));
  return fallback;
}

function normalizeViolation(
  violation: PortalViolation | string,
  item: PortalNegativeItem
): {
  code: string;
  title: string;
  detail: string;
  category?: string | null;
  severity: number;
  bureaus: string[];
  source?: string | null;
  disputeReason?: string | null;
  fcraSection?: string | null;
  recommendedAction?: string | null;
} {
  if (typeof violation === 'string') {
    return {
      code: violation,
      title: violation,
      detail: '',
      category: null,
      severity: resolveSeverity(violation, item),
      bureaus: collectBureaus(violation, item),
      source: null,
      disputeReason: null,
      fcraSection: null,
      recommendedAction: null,
    };
  }
  const code = violation.code || violation.id || violation.title || 'UNKNOWN_RULE';
  const title = violation.title || violation.code || violation.id || 'Metro-2 Rule';
  const detail = typeof violation.detail === 'string' ? violation.detail : '';
  const bureaus = collectBureaus(violation, item);
  return {
    code,
    title,
    detail,
    category: violation.category || null,
    severity: resolveSeverity(violation, item),
    bureaus,
    source: violation.source || null,
    disputeReason: violation.disputeReason || null,
    fcraSection: violation.fcraSection || null,
    recommendedAction: violation.recommendedAction || null,
  };
}

function filterViolationsByTradelineKey(
  violations: Array<PortalViolation | string>,
  item: PortalNegativeItem
): Array<PortalViolation | string> {
  const tradelineKeys = Array.isArray(item.tradelineKeys)
    ? item.tradelineKeys.filter((key) => typeof key === 'string' && key.trim().length > 0)
    : [];
  if (tradelineKeys.length === 0) {
    return violations;
  }
  return violations.filter((violation) => {
    if (typeof violation === 'string') return false;
    return Boolean(violation?.tradelineKey && tradelineKeys.includes(violation.tradelineKey));
  });
}

export function buildRuleGroups(items: PortalNegativeItem[] | undefined | null): BureauRuleGroup[] {
  const groups = new Map<string, Map<string, BureauRuleCard>>();
  const encounteredBureaus = new Set<string>();
  DEFAULT_BUREAUS.forEach((bureau) => {
    encounteredBureaus.add(bureau);
    groups.set(bureau, new Map());
  });

  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const violations = Array.isArray(item.violations) ? item.violations : [];
      const filteredViolations = filterViolationsByTradelineKey(violations, item);
      for (const violationEntry of filteredViolations) {
        if (!violationEntry) continue;
        const normalizedViolation = normalizeViolation(violationEntry, item);
        const bureaus = normalizedViolation.bureaus.length
          ? normalizedViolation.bureaus
          : Array.from(DEFAULT_BUREAUS);
        for (const bureauName of bureaus) {
          const bureau = normalizeBureauName(bureauName) || bureauName;
          encounteredBureaus.add(bureau);
          ensureBureau(groups, bureau);
          const bucket = groups.get(bureau);
          if (!bucket) continue;
          const detail = normalizedViolation.detail.trim();
          const cardKey = `${bureau}|${normalizedViolation.code}|${normalizedViolation.title}|${detail}|${item.creditor ?? ''}`;
          if (bucket.has(cardKey)) continue;
          const fields = extractHighlights(item.bureau_details?.[bureau]);
          bucket.set(cardKey, {
            key: cardKey,
            bureau,
            title: normalizedViolation.title,
            detail,
            code: normalizedViolation.code,
            severity: normalizedViolation.severity,
            category: normalizedViolation.category,
            creditor: item.creditor || null,
            source: normalizedViolation.source || null,
            disputeReason: normalizedViolation.disputeReason || null,
            fcraSection: normalizedViolation.fcraSection || null,
            recommendedAction: normalizedViolation.recommendedAction || null,
            fields,
          });
        }
      }
    }
  }

  const sortedBureaus = Array.from(encounteredBureaus);
  sortedBureaus.sort((a, b) => {
    const indexA = DEFAULT_BUREAUS.indexOf(a as (typeof DEFAULT_BUREAUS)[number]);
    const indexB = DEFAULT_BUREAUS.indexOf(b as (typeof DEFAULT_BUREAUS)[number]);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });

  return sortedBureaus.map((bureau) => {
    const bucket = groups.get(bureau);
    const cards = bucket ? Array.from(bucket.values()) : [];
    cards.sort((a, b) => {
      const severityDelta = (b.severity ?? 0) - (a.severity ?? 0);
      if (severityDelta !== 0) return severityDelta;
      return a.title.localeCompare(b.title);
    });
    return { bureau, cards };
  });
}
