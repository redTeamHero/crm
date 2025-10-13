import { readKey, writeKey } from './kvdb.js';

const DASHBOARD_CONFIG_KEY = 'dashboard_config_v1';

export const DEFAULT_DASHBOARD_CONFIG = Object.freeze({
  goals: {
    leadToConsultTarget: 32,
    retentionTarget: 92,
    monthlyRecurringTarget: 84000,
  },
  ladder: {
    title: 'Revenue Ladder to 7 Figures',
    subtitle: 'Premium dispute services roadmap. No guaranteed timelines or deletions.',
    goalLabel: 'Goal / Meta',
    goalAmountLabel: '$84k mo',
    goalCaption: 'Objetivo mensual',
    mrrCaption: 'Keep churn < 5% and auto-schedule retention consults.',
    pipelineValue: 'Load CRM',
    pipelineCaption: 'Daily KPI: Consult → Purchase 35%.',
    aovValue: 'Link Stripe',
    aovCaption: 'Bundle certified mail credits for premium feel.',
    milestone: 'Next milestone: $25k/mo unlocks concierge onboarding.',
    milestoneCaption: 'Próximo objetivo intermedio',
    progressBaselineLabel: '$0',
    progressGoalLabel: 'Meta $84k',
    upsellHeading: 'Upsell idea:',
    upsellBody: 'Automation bundle at $249/mo with certified mail credits + NEPQ scripts.',
    playbookLabel: 'View Playbook',
    playbookUrl: '#',
    spanishSummaryLabel: 'Ver resumen en español',
    spanishSummaryUrl: '#',
  },
});

function deepMerge(base = {}, override = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] && typeof result[key] === 'object' ? result[key] : {}, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeNumber(value, fallback, { min = 0, max = 1_000_000_000 } = {}) {
  const num = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(max, Math.max(min, num));
  return Math.round(clamped);
}

function sanitizePercent(value, fallback) {
  return sanitizeNumber(value, fallback, { min: 0, max: 1000 });
}

function sanitizeCurrency(value, fallback) {
  return sanitizeNumber(value, fallback, { min: 0, max: 100_000_000 });
}

function sanitizeText(value, fallback, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed && !allowEmpty) return fallback;
  return trimmed;
}

function sanitizeUrl(value, fallback, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return allowEmpty ? '' : fallback;
  return trimmed;
}

function normalizeDashboardConfig(raw = {}) {
  const merged = deepMerge(DEFAULT_DASHBOARD_CONFIG, raw && typeof raw === 'object' ? raw : {});
  const goals = merged.goals || {};
  const ladder = merged.ladder || {};

  const normalized = {
    goals: {
      leadToConsultTarget: sanitizePercent(goals.leadToConsultTarget, DEFAULT_DASHBOARD_CONFIG.goals.leadToConsultTarget),
      retentionTarget: sanitizePercent(goals.retentionTarget, DEFAULT_DASHBOARD_CONFIG.goals.retentionTarget),
      monthlyRecurringTarget: sanitizeCurrency(
        goals.monthlyRecurringTarget,
        DEFAULT_DASHBOARD_CONFIG.goals.monthlyRecurringTarget,
      ),
    },
    ladder: {
      title: sanitizeText(ladder.title, DEFAULT_DASHBOARD_CONFIG.ladder.title),
      subtitle: sanitizeText(ladder.subtitle, DEFAULT_DASHBOARD_CONFIG.ladder.subtitle),
      goalLabel: sanitizeText(ladder.goalLabel, DEFAULT_DASHBOARD_CONFIG.ladder.goalLabel),
      goalAmountLabel: sanitizeText(
        ladder.goalAmountLabel,
        DEFAULT_DASHBOARD_CONFIG.ladder.goalAmountLabel,
        { allowEmpty: true },
      ),
      goalCaption: sanitizeText(ladder.goalCaption, DEFAULT_DASHBOARD_CONFIG.ladder.goalCaption),
      mrrCaption: sanitizeText(ladder.mrrCaption, DEFAULT_DASHBOARD_CONFIG.ladder.mrrCaption),
      pipelineValue: sanitizeText(ladder.pipelineValue, DEFAULT_DASHBOARD_CONFIG.ladder.pipelineValue),
      pipelineCaption: sanitizeText(ladder.pipelineCaption, DEFAULT_DASHBOARD_CONFIG.ladder.pipelineCaption),
      aovValue: sanitizeText(ladder.aovValue, DEFAULT_DASHBOARD_CONFIG.ladder.aovValue),
      aovCaption: sanitizeText(ladder.aovCaption, DEFAULT_DASHBOARD_CONFIG.ladder.aovCaption),
      milestone: sanitizeText(ladder.milestone, DEFAULT_DASHBOARD_CONFIG.ladder.milestone),
      milestoneCaption: sanitizeText(ladder.milestoneCaption, DEFAULT_DASHBOARD_CONFIG.ladder.milestoneCaption),
      progressBaselineLabel: sanitizeText(
        ladder.progressBaselineLabel,
        DEFAULT_DASHBOARD_CONFIG.ladder.progressBaselineLabel,
      ),
      progressGoalLabel: sanitizeText(
        ladder.progressGoalLabel,
        DEFAULT_DASHBOARD_CONFIG.ladder.progressGoalLabel,
      ),
      upsellHeading: sanitizeText(ladder.upsellHeading, DEFAULT_DASHBOARD_CONFIG.ladder.upsellHeading),
      upsellBody: sanitizeText(ladder.upsellBody, DEFAULT_DASHBOARD_CONFIG.ladder.upsellBody),
      playbookLabel: sanitizeText(ladder.playbookLabel, DEFAULT_DASHBOARD_CONFIG.ladder.playbookLabel),
      playbookUrl: sanitizeUrl(ladder.playbookUrl, DEFAULT_DASHBOARD_CONFIG.ladder.playbookUrl, { allowEmpty: true }),
      spanishSummaryLabel: sanitizeText(
        ladder.spanishSummaryLabel,
        DEFAULT_DASHBOARD_CONFIG.ladder.spanishSummaryLabel,
      ),
      spanishSummaryUrl: sanitizeUrl(
        ladder.spanishSummaryUrl,
        DEFAULT_DASHBOARD_CONFIG.ladder.spanishSummaryUrl,
        { allowEmpty: true },
      ),
    },
  };

  return normalized;
}

export async function getDashboardConfig() {
  const raw = await readKey(DASHBOARD_CONFIG_KEY, null);
  const normalized = normalizeDashboardConfig(raw || {});
  // Persist defaults if nothing stored yet so later reads are fast
  if (!raw) {
    await writeKey(DASHBOARD_CONFIG_KEY, normalized);
  }
  return JSON.parse(JSON.stringify(normalized));
}

export async function updateDashboardConfig(patch = {}) {
  const current = await getDashboardConfig();
  const merged = deepMerge(current, patch && typeof patch === 'object' ? patch : {});
  const normalized = normalizeDashboardConfig(merged);
  await writeKey(DASHBOARD_CONFIG_KEY, normalized);
  return JSON.parse(JSON.stringify(normalized));
}

export { DASHBOARD_CONFIG_KEY };
