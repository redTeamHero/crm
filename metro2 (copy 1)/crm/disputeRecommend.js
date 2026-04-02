import { LETTER_TEMPLATES } from './letterTemplates.js';

const templateMap = Object.fromEntries(LETTER_TEMPLATES.map(t => [t.id, t]));

function findTemplate(id) {
  return templateMap[id] || null;
}

function hasViolationType(violations, keywords) {
  if (!Array.isArray(violations) || violations.length === 0) return false;
  const lower = keywords.map(k => k.toLowerCase());
  return violations.some(v => {
    const text = (typeof v === 'string' ? v : [v.description, v.rule, v.violation, v.title, v.detail, v.code, v.category].filter(Boolean).join(' ')).toLowerCase();
    return lower.some(k => text.includes(k));
  });
}

const COLLECTOR_TEMPLATES = new Set([
  'debt-validation',
  'cease-and-desist',
  'hipaa-medical-debt',
  'fdcpa-harassment',
  'fdcpa-time-barred',
  'pay-for-delete',
  'pay-for-delete-followup',
]);

function tgt(template) {
  return COLLECTOR_TEMPLATES.has(template) ? 'collector' : 'bureau';
}

function applyOverride(result, overrides) {
  if (!overrides || !result.scenarioKey) return result;
  if (Object.prototype.hasOwnProperty.call(overrides, result.scenarioKey)) {
    const t = overrides[result.scenarioKey];
    if (t == null || t === '') return { ...result, recommendedTemplate: null };
    return { ...result, recommendedTemplate: t, letterTarget: tgt(t) };
  }
  return result;
}

export const INTELLISENSE_SCENARIOS = [
  // ── First Round: Specialty (fast-paths that override everything) ─────────
  { group: 'First Round: Specialty',               key: 'first:identity_theft',          label: 'Identity theft / mixed file / wrong personal info',  defaultTemplate: 'personal-info-update' },
  { group: 'First Round: Specialty',               key: 'first:reinsertion',              label: 'Re-inserted / reappearing item (fast-path)',          defaultTemplate: 'reinsertion-dispute' },
  { group: 'First Round: Specialty',               key: 'first:medical_collection',       label: 'Medical debt in collections',                        defaultTemplate: 'hipaa-medical-debt' },
  { group: 'First Round: Specialty',               key: 'first:harassment_collection',    label: 'Harassment / abusive collection',                    defaultTemplate: 'fdcpa-harassment' },
  { group: 'First Round: Specialty',               key: 'first:time_barred_collection',   label: 'Time-barred debt (collection)',                      defaultTemplate: 'fdcpa-time-barred' },
  { group: 'First Round: Specialty',               key: 'first:tila_loan',                label: 'TILA disclosure violation (loan)',                   defaultTemplate: 'tila-disclosure' },
  { group: 'First Round: Specialty',               key: 'first:bankruptcy',               label: 'Bankruptcy misreporting',                            defaultTemplate: 'bankruptcy-misreporting' },

  // ── First Round: Factual / Evidence-Based ───────────────────────────────
  { group: 'First Round: Factual / Evidence-Based', key: 'first:factual_mismatch',        label: 'Factual error — date / balance / status mismatch',   defaultTemplate: 'factual-errors-layer' },
  { group: 'First Round: Factual / Evidence-Based', key: 'first:metro2_inconsistency',    label: 'Metro 2 field inconsistency / compliance issue',      defaultTemplate: 'metro2-inconsistency-dispute' },
  { group: 'First Round: Factual / Evidence-Based', key: 'first:obsolete_debt',           label: 'Obsolete / expired debt (past reporting period)',     defaultTemplate: 'obsolete-debt' },
  { group: 'First Round: Factual / Evidence-Based', key: 'first:charge_off',              label: 'Charge-off account — factual or Metro 2 dispute',     defaultTemplate: 'factual-errors-layer' },

  // ── First Round: Collection / Fallback ──────────────────────────────────
  { group: 'First Round: Collection / Fallback',   key: 'first:general_collection',       label: 'General collection account (no specific error)',      defaultTemplate: 'debt-validation' },
  { group: 'First Round: Collection / Fallback',   key: 'first:late_payment_inaccurate',  label: 'Late payment — provably inaccurate',                 defaultTemplate: 'factual-errors-layer' },
  { group: 'First Round: Collection / Fallback',   key: 'first:late_payment_only',        label: 'Late payment — accurate, goodwill eligible',         defaultTemplate: 'goodwill-removal' },
  { group: 'First Round: Collection / Fallback',   key: 'first:violations_general',       label: 'General inaccuracies (violations detected)',         defaultTemplate: 'factual-errors-layer' },
  { group: 'First Round: Collection / Fallback',   key: 'first:default',                  label: 'Default first-touch (no specific match)',             defaultTemplate: '611-general-dispute' },

  // ── Follow-up: Awaiting Response ────────────────────────────────────────
  { group: 'Follow-up: Awaiting Response',  key: 'next:awaiting_time_barred',     label: 'Awaiting — time-barred collection (round 2+)',          defaultTemplate: 'fdcpa-time-barred' },
  { group: 'Follow-up: Awaiting Response',  key: 'next:awaiting_collection',      label: 'Awaiting — general collection',                        defaultTemplate: 'debt-validation' },
  { group: 'Follow-up: Awaiting Response',  key: 'next:awaiting_bankruptcy',      label: 'Awaiting — bankruptcy',                                defaultTemplate: 'bankruptcy-misreporting' },
  { group: 'Follow-up: Awaiting Response',  key: 'next:awaiting_obsolete',        label: 'Awaiting — obsolete debt',                             defaultTemplate: 'obsolete-debt' },
  { group: 'Follow-up: Awaiting Response',  key: 'next:awaiting_metro2',          label: 'Awaiting — Metro 2 issues',                            defaultTemplate: 'metro2-inconsistency-dispute' },
  { group: 'Follow-up: Awaiting Response',  key: 'next:awaiting_default',         label: 'Awaiting — default',                                   defaultTemplate: 'second-round-dispute' },

  // ── Follow-up: No Response ──────────────────────────────────────────────
  { group: 'Follow-up: No Response',        key: 'next:no_response_pfd',           label: 'No response — follow-up on prior PFD offer',           defaultTemplate: 'pay-for-delete-followup' },
  { group: 'Follow-up: No Response',        key: 'next:no_response_time_barred',   label: 'No response — time-barred collection (round 2+)',      defaultTemplate: 'fdcpa-time-barred' },
  { group: 'Follow-up: No Response',        key: 'next:no_response_metro2_r3',     label: 'No response — Metro 2 (round 3+, strong evidence)',    defaultTemplate: 'metro2-deletion-demand' },
  { group: 'Follow-up: No Response',        key: 'next:no_response_r3',            label: 'No response — escalation (strong evidence, round 3+)', defaultTemplate: 'ag-cfpb-escalation' },
  { group: 'Follow-up: No Response',        key: 'next:no_response_collection_r2', label: 'No response — collection round 2 (method of verification)', defaultTemplate: 'method-of-verification' },
  { group: 'Follow-up: No Response',        key: 'next:no_response_method',        label: 'No response — investigation pressure (method of verification)', defaultTemplate: 'method-of-verification' },
  { group: 'Follow-up: No Response',        key: 'next:no_response_collection',    label: 'No response — general collection',                     defaultTemplate: 'debt-validation' },
  { group: 'Follow-up: No Response',        key: 'next:no_response_factual_r2',    label: 'No response — factual errors (round 2+)',              defaultTemplate: 'factual-errors-layer' },
  { group: 'Follow-up: No Response',        key: 'next:no_response_default',       label: 'No response — default',                               defaultTemplate: 'second-round-dispute' },

  // ── Follow-up: Verified ─────────────────────────────────────────────────
  { group: 'Follow-up: Verified',           key: 'next:verified_method',           label: 'Verified — method of verification (round 2 default)',  defaultTemplate: 'method-of-verification' },
  { group: 'Follow-up: Verified',           key: 'next:verified_metro2_r3',        label: 'Verified — Metro 2 deletion demand (round 3+)',        defaultTemplate: 'metro2-deletion-demand' },
  { group: 'Follow-up: Verified',           key: 'next:verified_r3',               label: 'Verified — escalation (strong evidence, round 3+)',    defaultTemplate: 'ag-cfpb-escalation' },
  { group: 'Follow-up: Verified',           key: 'next:verified_collection_r2',    label: 'Verified — collection (method of verification, round 2+)', defaultTemplate: 'method-of-verification' },
  { group: 'Follow-up: Verified',           key: 'next:verified_collection',       label: 'Verified — collection default',                        defaultTemplate: '623-direct-dispute' },
  { group: 'Follow-up: Verified',           key: 'next:verified_factual',          label: 'Verified — factual errors (evidence layer)',           defaultTemplate: 'factual-errors-layer' },
  { group: 'Follow-up: Verified',           key: 'next:verified_metro2',           label: 'Verified — Metro 2 (method of verification)',          defaultTemplate: 'method-of-verification' },
  { group: 'Follow-up: Verified',           key: 'next:verified_default',          label: 'Verified — default',                                   defaultTemplate: 'method-of-verification' },

  // ── Follow-up: Other Outcomes ───────────────────────────────────────────
  { group: 'Follow-up: Other Outcomes',     key: 'next:medical_collection',        label: 'Medical collection follow-up',                         defaultTemplate: 'hipaa-medical-debt' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:harassment_collection',     label: 'Harassment follow-up',                                 defaultTemplate: 'fdcpa-harassment' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:stalled_r3',               label: 'Stalled — round 3+ (arbitration)',                     defaultTemplate: 'arbitration-election' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:stalled_default',           label: 'Stalled — furnisher direct dispute',                   defaultTemplate: '623-direct-dispute' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:partial_goodwill',          label: 'Partial correction — goodwill eligible',               defaultTemplate: 'goodwill-removal' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:partial_collection',        label: 'Partial correction — collection',                      defaultTemplate: '623-direct-dispute' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:partial_default',           label: 'Partial correction — remaining inaccuracies',          defaultTemplate: 'factual-errors-layer' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:updated',                   label: 'Item updated — verification request',                  defaultTemplate: 'method-of-verification' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:r3_metro2',                 label: 'Round 3+ — Metro 2 deletion demand',                   defaultTemplate: 'metro2-deletion-demand' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:r3_default',               label: 'Round 3+ — escalation (evidence-based)',               defaultTemplate: 'ag-cfpb-escalation' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:collection_time_barred_r2', label: 'Collection — time-barred round 2+',                    defaultTemplate: 'fdcpa-time-barred' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:collection_r2_pfd',         label: 'Collection — round 2+ (method of verification)',       defaultTemplate: 'method-of-verification' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:pfd_last_resort',           label: 'PFD — last resort (evidence exhausted, debt likely valid)', defaultTemplate: 'pay-for-delete' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:collection_default',        label: 'Collection — default follow-up',                       defaultTemplate: 'debt-validation' },
  { group: 'Follow-up: Other Outcomes',     key: 'next:default',                   label: 'Default follow-up',                                    defaultTemplate: 'method-of-verification' },
];

export function recommendFirstLetter({ violations = [], accountType = '', accountStatus = '' }, overrides = {}) {
  const type = (accountType || '').toLowerCase();
  const status = (accountStatus || '').toLowerCase();
  const hasViolations = Array.isArray(violations) && violations.length > 0;

  // ── Evidence signals ──────────────────────────────────────────────────
  const hasIdentityTheft = hasViolationType(violations, [
    'identity theft', 'identity fraud', 'mixed file', 'not mine', 'wrong person',
    'fraud alert', 'block requested', '1681c-2', 'fcra 605b', 'wrong personal',
    'name mismatch', 'address mismatch', 'ssn mismatch', 'social security mismatch',
  ]) || type.includes('identity') || status.includes('fraud') || status.includes('mixed file');

  const hasReinsertion = hasViolationType(violations, [
    'reinsert', 're-insert', 'reappear', 'previously deleted', 'came back', 'returned after deletion',
  ]);

  const isMedical = type.includes('medical') || type.includes('health') || type.includes('hospital')
    || status.includes('medical') || status.includes('health')
    || hasViolationType(violations, ['medical', 'hipaa', 'health', 'hospital', 'healthcare', 'physician', 'clinic']);

  const isCollection = status.includes('collection') || type.includes('collection') || type.includes('debt')
    || hasViolationType(violations, ['collection', 'collector', 'debt buyer', 'purchased']);

  const isChargeOff = status.includes('charge-off') || status.includes('charge off') || status.includes('chargeoff')
    || type.includes('charge-off') || type.includes('chargeoff')
    || hasViolationType(violations, ['charge-off', 'charge off', 'charged off', 'chargeoff', 'written off']);

  const isLoan = type.includes('loan') || type.includes('mortgage') || type.includes('installment')
    || type.includes('auto') || type.includes('personal') || type.includes('student');

  const hasHarassment = hasViolationType(violations, ['harassment', 'excessive call', 'abusive', 'intimidat', 'threaten', 'harass']);

  const hasTimeBarred = hasViolationType(violations, ['time-barred', 'time barred', 'statute of limitation', 'sol expired', 'barred by statute', ' sol ', '(sol)', 'sol)']);

  const hasDateMismatch = hasViolationType(violations, [
    'incorrect date', 'wrong date', 'date error', 'date mismatch', 'open date', 'close date',
    'date of first delinquency', 'dofd', 'date discrepancy', 'reporting date wrong',
  ]);

  const hasBalanceMismatch = hasViolationType(violations, [
    'balance error', 'incorrect balance', 'wrong balance', 'balance mismatch',
    'amount wrong', 'balance discrepancy', 'outstanding balance incorrect',
  ]);

  const hasStatusMismatch = hasViolationType(violations, [
    'status error', 'status mismatch', 'wrong status', 'account status', 'payment status',
    'reporting status', 'status discrepancy', 'current but reporting derogatory',
    'paid but still showing', 'paid in full', 'closed but showing open',
  ]);

  const hasDuplicateReporting = hasViolationType(violations, [
    'duplicate', 'double reporting', 'reported twice', 'duplicate entry', 'same account twice',
  ]);

  const hasFactualMismatch = hasDateMismatch || hasBalanceMismatch || hasStatusMismatch || hasDuplicateReporting;

  const hasMetro2 = hasViolationType(violations, ['metro 2', 'metro2', 'compliance', 'inconsisten', 'field', 'segment', 'format']);

  const hasObsolete = hasViolationType(violations, ['obsolete', 'expired', 'seven year', '7 year', 'time-barred', 'statute of limitation']);

  const hasBankruptcy = status.includes('bankrupt') || type.includes('bankrupt') || hasViolationType(violations, ['bankrupt', 'discharge']);

  const hasTILA = hasViolationType(violations, ['tila', 'truth in lending', 'finance charge', 'annual percentage rate', 'apr violation', 'disclosure required', 'rescission', 'right to cancel']);

  const hasLatePaymentSignal = hasViolationType(violations, ['late payment', 'late pay', 'goodwill', 'isolated late', '30 day late', '60 day late', '90 day late']);
  const hasLatePaymentOnly = hasLatePaymentSignal
    && !isCollection && !isChargeOff;

  // Composite evidence strength signals (used for routing and gating)
  const hasStrongEvidence = hasFactualMismatch || hasMetro2 || hasObsolete
    || hasReinsertion || hasIdentityTheft
    || hasViolationType(violations, ['bankrupt', 'discharge', 'fraud']);
  const hasWeakEvidence = !hasStrongEvidence;

  // ── Decision tree: specialty fast-paths first ─────────────────────────

  // 1. Identity theft — FCRA §1681c-2 block workflow takes highest priority
  if (hasIdentityTheft) {
    return applyOverride({
      scenarioKey: 'first:identity_theft',
      recommendedTemplate: 'personal-info-update',
      reason: 'Identity theft or mixed file indicators detected — initiate information block request under FCRA §1681c-2; do not send generic dispute',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['609-disclosure', '611-general-dispute'],
    }, overrides);
  }

  // 2. Reinsertion — FCRA §1681i(a)(5) fast-path before anything else
  if (hasReinsertion) {
    return applyOverride({
      scenarioKey: 'first:reinsertion',
      recommendedTemplate: 'reinsertion-dispute',
      reason: 'Item appears to have been reinserted after prior deletion — dispute under FCRA §1681i(a)(5)(B) which requires notice and documentation',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', 'ag-cfpb-escalation'],
    }, overrides);
  }

  // 3. Medical collection — HIPAA + FDCPA
  if (isMedical && isCollection) {
    return applyOverride({
      scenarioKey: 'first:medical_collection',
      recommendedTemplate: 'hipaa-medical-debt',
      reason: 'Medical debt in collections — request HIPAA authorization and full itemized validation under FDCPA §809',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['debt-validation', 'cease-and-desist'],
    }, overrides);
  }

  // 4. Harassment / abusive collection conduct — FDCPA §806
  if (hasHarassment && isCollection) {
    return applyOverride({
      scenarioKey: 'first:harassment_collection',
      recommendedTemplate: 'fdcpa-harassment',
      reason: 'Harassment or abusive collection conduct detected — formally document and demand it stop under FDCPA §806',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['cease-and-desist', 'debt-validation'],
    }, overrides);
  }

  // 5. Time-barred collection — FDCPA
  if (hasTimeBarred && isCollection) {
    return applyOverride({
      scenarioKey: 'first:time_barred_collection',
      recommendedTemplate: 'fdcpa-time-barred',
      reason: 'Debt appears to be past the statute of limitations — request proof the debt is still collectible under FDCPA',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['obsolete-debt', 'debt-validation'],
    }, overrides);
  }

  // ── Factual / evidence-based routes ──────────────────────────────────

  // 6. Factual mismatch (date / balance / status / duplicate) — precision dispute
  //    Excluded from late-payment-only accounts, which have their own fork below
  //    so that first:late_payment_inaccurate is reachable as a distinct configurable scenario
  if (hasFactualMismatch && !hasLatePaymentOnly) {
    return applyOverride({
      scenarioKey: 'first:factual_mismatch',
      recommendedTemplate: 'factual-errors-layer',
      reason: 'Specific factual error detected (date, balance, or status mismatch) — cite the exact discrepancy and supporting evidence per CFPB/FTC guidance',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['metro2-inconsistency-dispute', '623-direct-dispute'],
    }, overrides);
  }

  // 7. Metro 2 inconsistency
  if (hasMetro2) {
    return applyOverride({
      scenarioKey: 'first:metro2_inconsistency',
      recommendedTemplate: 'metro2-inconsistency-dispute',
      reason: 'Metro 2 compliance inconsistencies detected — dispute specific field-level violations and demand corrected data submission',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['factual-errors-layer', '623-direct-dispute'],
    }, overrides);
  }

  // 8. Obsolete / expired reporting
  if (hasObsolete) {
    return applyOverride({
      scenarioKey: 'first:obsolete_debt',
      recommendedTemplate: 'obsolete-debt',
      reason: 'Debt appears obsolete or past the reporting period — request removal under FCRA §1681c',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute'],
    }, overrides);
  }

  // 9. Bankruptcy misreporting
  if (hasBankruptcy) {
    return applyOverride({
      scenarioKey: 'first:bankruptcy',
      recommendedTemplate: 'bankruptcy-misreporting',
      reason: 'Bankruptcy-related item detected — dispute incorrect post-discharge reporting',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute'],
    }, overrides);
  }

  // 10. TILA loan disclosure violation
  if (hasTILA && isLoan) {
    return applyOverride({
      scenarioKey: 'first:tila_loan',
      recommendedTemplate: 'tila-disclosure',
      reason: 'Loan account with disclosure violations — demand full TILA disclosure of rates, fees, and payment terms',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute'],
    }, overrides);
  }

  // 11. Charge-off — factual or Metro 2 precision dispute
  if (isChargeOff) {
    return applyOverride({
      scenarioKey: 'first:charge_off',
      recommendedTemplate: 'factual-errors-layer',
      reason: 'Charge-off account — lead with specific date, balance, or status inaccuracies rather than a generic dispute; cite exact field-level errors',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['metro2-inconsistency-dispute', '623-direct-dispute'],
    }, overrides);
  }

  // ── Collection / fallback routes ──────────────────────────────────────

  // 12. General collection (no more specific evidence path above matched)
  if (isCollection) {
    return applyOverride({
      scenarioKey: 'first:general_collection',
      recommendedTemplate: 'debt-validation',
      reason: 'Collection account — request full debt validation under FDCPA §809 before proceeding',
      urgency: 'medium',
      letterTarget: 'collector',
      alternativeTemplates: ['611-general-dispute', 'cease-and-desist'],
    }, overrides);
  }

  // 13a. Late payment that is provably inaccurate — must have a concrete factual discrepancy
  //      (date/balance/status mismatch), not just the presence of any violation string
  if (hasLatePaymentOnly && hasFactualMismatch) {
    return applyOverride({
      scenarioKey: 'first:late_payment_inaccurate',
      recommendedTemplate: 'factual-errors-layer',
      reason: 'Late payment with a documented factual error — dispute the specific inaccuracy rather than relying on goodwill',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute'],
    }, overrides);
  }

  // 13b. Late payment — accurate or unclear, goodwill path
  if (hasLatePaymentOnly) {
    return applyOverride({
      scenarioKey: 'first:late_payment_only',
      recommendedTemplate: 'goodwill-removal',
      reason: 'Late payment notation on otherwise current account — request goodwill removal from the creditor',
      urgency: 'low',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute'],
    }, overrides);
  }

  // 14. Has violations but no more specific path — use factual-errors-layer when any signal exists
  if (hasViolations) {
    return applyOverride({
      scenarioKey: 'first:violations_general',
      recommendedTemplate: 'factual-errors-layer',
      reason: 'Inaccuracies detected — lead with a specific factual evidence dispute rather than a generic §611 request per CFPB guidance',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', 'method-of-verification', '623-direct-dispute'],
    }, overrides);
  }

  // 15. Default — truly no evidence available
  return applyOverride({
    scenarioKey: 'first:default',
    recommendedTemplate: '611-general-dispute',
    reason: 'General dispute recommended — request investigation under FCRA §611; gather supporting documents to strengthen follow-up',
    urgency: 'low',
    letterTarget: 'bureau',
    alternativeTemplates: ['609-disclosure', 'factual-errors-layer'],
  }, overrides);
}

export function recommendNextLetter({ letterType = '', round = 1, outcome = '', violations = [], accountType = '', accountStatus = '' }, overrides = {}) {
  const prev = (letterType || '').toLowerCase();
  const result = (outcome || '').toLowerCase();
  const type = (accountType || '').toLowerCase();
  const status = (accountStatus || '').toLowerCase();

  // ── Evidence signals ──────────────────────────────────────────────────
  const isCollection = type.includes('collection') || type.includes('debt') || status.includes('collection');

  const isChargeOff = status.includes('charge-off') || status.includes('charge off') || status.includes('chargeoff')
    || type.includes('charge-off') || type.includes('chargeoff')
    || hasViolationType(violations, ['charge-off', 'charge off', 'charged off', 'chargeoff', 'written off']);

  const hasIdentityTheft = hasViolationType(violations, [
    'identity theft', 'identity fraud', 'mixed file', 'not mine', 'wrong person',
    'fraud alert', 'block requested', '1681c-2', 'fcra 605b', 'wrong personal',
    'name mismatch', 'address mismatch', 'ssn mismatch', 'social security mismatch',
  ]) || type.includes('identity') || status.includes('fraud') || status.includes('mixed file');

  const isMedical = type.includes('medical') || type.includes('health') || type.includes('hospital')
    || status.includes('medical') || status.includes('health')
    || hasViolationType(violations, ['medical', 'hipaa', 'health', 'hospital', 'healthcare', 'physician', 'clinic']);

  const hasBankruptcy = status.includes('bankrupt') || type.includes('bankrupt') || hasViolationType(violations, ['bankrupt', 'discharge']);

  const hasMetro2Issues = hasViolationType(violations, ['metro 2', 'metro2', 'compliance', 'inconsisten', 'field', 'segment', 'format']);

  const hasObsolete = hasViolationType(violations, ['obsolete', 'expired', 'seven year', '7 year', 'time-barred', 'statute of limitation']);

  const hasHarassment = hasViolationType(violations, ['harassment', 'excessive call', 'abusive', 'intimidat', 'threaten', 'harass']);

  const hasTimeBarred = hasViolationType(violations, ['time-barred', 'time barred', 'statute of limitation', 'sol expired', 'barred by statute', ' sol ', '(sol)', 'sol)']);

  const hasDateMismatch = hasViolationType(violations, [
    'incorrect date', 'wrong date', 'date error', 'date mismatch', 'open date', 'close date',
    'date of first delinquency', 'dofd', 'date discrepancy', 'reporting date wrong',
  ]);

  const hasBalanceMismatch = hasViolationType(violations, [
    'balance error', 'incorrect balance', 'wrong balance', 'balance mismatch',
    'amount wrong', 'balance discrepancy', 'outstanding balance incorrect',
  ]);

  const hasStatusMismatch = hasViolationType(violations, [
    'status error', 'status mismatch', 'wrong status', 'account status', 'payment status',
    'reporting status', 'status discrepancy', 'current but reporting derogatory',
    'paid but still showing', 'paid in full', 'closed but showing open',
  ]);

  const hasDuplicateReporting = hasViolationType(violations, [
    'duplicate', 'double reporting', 'reported twice', 'duplicate entry', 'same account twice',
  ]);

  const hasFactualErrors = hasViolationType(violations, ['factual', 'incorrect date', 'balance error', 'wrong date', 'incorrect balance', 'date error'])
    || hasDateMismatch || hasBalanceMismatch || hasStatusMismatch;

  const hasGoodwillEligible = hasViolationType(violations, ['late payment', 'late pay', 'goodwill', 'isolated late', '30 day late', '60 day late'])
    && !status.includes('collection') && !status.includes('charge-off') && !status.includes('charge off')
    && !type.includes('collection') && !type.includes('debt');

  const hasPFDContext = hasViolationType(violations, ['pay for delete', 'pay-for-delete', 'settlement offer', 'conditional settlement', 'delete in exchange']);
  const prevIsPFD = prev.includes('pay-for-delete') || hasPFDContext;

  // Strong evidence = there is a documented inaccuracy that justifies escalation
  const hasStrongEvidence = hasFactualErrors || hasMetro2Issues || hasObsolete || hasDuplicateReporting
    || hasViolationType(violations, ['reinsert', 'identity theft', 'fraud', 'bankrupt']);

  // Weak evidence = no strong signals — settlement/PFD may be appropriate
  const hasWeakEvidence = !hasStrongEvidence;

  // ── Absolute completion ───────────────────────────────────────────────
  if (result === 'removed' || result === 'deleted' || result === 'corrected') {
    return {
      scenarioKey: null,
      recommendedTemplate: null,
      reason: 'Item has been removed or corrected — no further action needed',
      urgency: 'none',
      letterTarget: 'bureau',
      alternativeTemplates: [],
    };
  }

  // ── Specialty fast-paths (always override outcome-based routing) ──────
  if (isMedical && isCollection) {
    return applyOverride({
      scenarioKey: 'next:medical_collection',
      recommendedTemplate: 'hipaa-medical-debt',
      reason: 'Medical collection account — request HIPAA authorization, itemized billing, and insurance verification under FDCPA §809',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['debt-validation', 'cease-and-desist'],
    }, overrides);
  }

  if (hasHarassment && isCollection) {
    return applyOverride({
      scenarioKey: 'next:harassment_collection',
      recommendedTemplate: 'fdcpa-harassment',
      reason: 'Harassment or abusive conduct from collector — demand it stop immediately under FDCPA §806',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['cease-and-desist', 'debt-validation'],
    }, overrides);
  }

  // ── Awaiting response ─────────────────────────────────────────────────
  if (result === 'awaiting' || result === 'awaiting_response') {
    if (hasTimeBarred && isCollection && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:awaiting_time_barred',
        recommendedTemplate: 'fdcpa-time-barred',
        reason: 'Collection account still awaiting — debt may be time-barred; demand proof it is within the statute of limitations',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', 'obsolete-debt'],
      }, overrides);
    }
    if (isCollection) {
      const template = prev.includes('debt-validation') ? 'second-round-dispute' : 'debt-validation';
      return applyOverride({
        scenarioKey: 'next:awaiting_collection',
        recommendedTemplate: template,
        reason: !prev.includes('debt-validation')
          ? 'Collection account still awaiting — send debt validation request under FDCPA §809'
          : 'Collection account awaiting response — follow up with escalated dispute',
        urgency: 'medium',
        letterTarget: tgt(template),
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute'],
      }, overrides);
    }
    if (hasBankruptcy) {
      return applyOverride({
        scenarioKey: 'next:awaiting_bankruptcy',
        recommendedTemplate: 'bankruptcy-misreporting',
        reason: 'Bankruptcy-related item awaiting response — follow up on discharge reporting',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute'],
      }, overrides);
    }
    if (hasObsolete) {
      return applyOverride({
        scenarioKey: 'next:awaiting_obsolete',
        recommendedTemplate: 'obsolete-debt',
        reason: 'Obsolete debt awaiting response — reiterate removal request under FCRA §1681c',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute'],
      }, overrides);
    }
    if (hasMetro2Issues) {
      return applyOverride({
        scenarioKey: 'next:awaiting_metro2',
        recommendedTemplate: 'metro2-inconsistency-dispute',
        reason: 'Metro 2 compliance issues still awaiting response — follow up demanding corrected data submission',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['second-round-dispute', 'method-of-verification'],
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:awaiting_default',
      recommendedTemplate: 'second-round-dispute',
      reason: 'Item still awaiting response — send follow-up dispute demanding reinvestigation',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', 'method-of-verification'],
    }, overrides);
  }

  // ── No response ───────────────────────────────────────────────────────
  if (result === 'no_response' || result === 'no response') {
    if (prevIsPFD) {
      return applyOverride({
        scenarioKey: 'next:no_response_pfd',
        recommendedTemplate: 'pay-for-delete-followup',
        reason: 'No response to pay-for-delete offer — renew the settlement offer with a firm deadline',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', 'ag-cfpb-escalation'],
      }, overrides);
    }
    if (hasTimeBarred && isCollection && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:no_response_time_barred',
        recommendedTemplate: 'fdcpa-time-barred',
        reason: 'No response on collection account — debt may be time-barred; demand proof it is within statute of limitations',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', 'obsolete-debt'],
      }, overrides);
    }
    // Round 3+: evidence-based escalation only — not just because round count reached 3
    if (round >= 3 && hasStrongEvidence) {
      if (hasMetro2Issues) {
        return applyOverride({
          scenarioKey: 'next:no_response_metro2_r3',
          recommendedTemplate: 'metro2-deletion-demand',
          reason: 'No response after multiple rounds with documented Metro 2 violations — demand deletion under FCRA §607(b) and §611',
          urgency: 'high',
          letterTarget: 'bureau',
          alternativeTemplates: ['ag-cfpb-escalation', 'arbitration-election'],
        }, overrides);
      }
      return applyOverride({
        scenarioKey: 'next:no_response_r3',
        recommendedTemplate: 'ag-cfpb-escalation',
        reason: 'No response after multiple rounds of documented specific disputes — escalate with CFPB/AG complaint citing the documented failure',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['arbitration-election'],
      }, overrides);
    }
    // Round 2 collection: method-of-verification before considering PFD
    if (isCollection && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:no_response_collection_r2',
        recommendedTemplate: 'method-of-verification',
        reason: 'No response from collector — demand method of verification and procedure description under FCRA §1681i(a)(7) before considering settlement',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['623-direct-dispute', 'debt-validation'],
      }, overrides);
    }
    if (hasFactualErrors && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:no_response_factual_r2',
        recommendedTemplate: 'factual-errors-layer',
        reason: 'No response despite documented factual errors — submit additional evidence and demand reopened investigation',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['second-round-dispute', 'method-of-verification'],
      }, overrides);
    }
    // General no-response with evidence: method of verification
    if (hasStrongEvidence) {
      return applyOverride({
        scenarioKey: 'next:no_response_method',
        recommendedTemplate: 'method-of-verification',
        reason: 'No response despite documented errors — demand method of verification under FCRA §1681i(a)(7)',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['factual-errors-layer', 'second-round-dispute'],
      }, overrides);
    }
    if (isCollection) {
      const template = prev.includes('debt-validation') ? 'second-round-dispute' : 'debt-validation';
      return applyOverride({
        scenarioKey: 'next:no_response_collection',
        recommendedTemplate: template,
        reason: !prev.includes('debt-validation')
          ? 'No response on collection account — demand debt validation under FDCPA §809'
          : 'No response after debt validation — escalate with second-round dispute',
        urgency: 'high',
        letterTarget: tgt(template),
        alternativeTemplates: ['ag-cfpb-escalation', '623-direct-dispute'],
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:no_response_default',
      recommendedTemplate: 'second-round-dispute',
      reason: 'No response received — send escalation dispute demanding proper reinvestigation',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['ag-cfpb-escalation', 'method-of-verification'],
    }, overrides);
  }

  // ── Verified ──────────────────────────────────────────────────────────
  if (result === 'verified') {
    // Round 3+: evidence-based escalation (not just because round 3 happened)
    if (round >= 3 && hasStrongEvidence) {
      if (hasMetro2Issues) {
        return applyOverride({
          scenarioKey: 'next:verified_metro2_r3',
          recommendedTemplate: 'metro2-deletion-demand',
          reason: 'Verified multiple times despite documented Metro 2 violations — demand deletion under FCRA §607(b) and §611',
          urgency: 'high',
          letterTarget: 'bureau',
          alternativeTemplates: ['ag-cfpb-escalation', 'arbitration-election'],
        }, overrides);
      }
      return applyOverride({
        scenarioKey: 'next:verified_r3',
        recommendedTemplate: 'ag-cfpb-escalation',
        reason: 'Item verified multiple times despite documented inaccuracies — escalate to CFPB/AG citing specific unremedied errors',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['arbitration-election', '623-direct-dispute'],
      }, overrides);
    }
    // Round 2+ with specific factual evidence — lead with evidence layer
    if (hasFactualErrors && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:verified_factual',
        recommendedTemplate: 'factual-errors-layer',
        reason: 'Verified despite documented factual errors — submit evidence layer to force substantive re-examination',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['method-of-verification', '623-direct-dispute'],
      }, overrides);
    }
    // Round 2+ collection: method-of-verification is the default for ALL account types
    // (per FCRA §1681i(a)(7)); tenant overrides on next:verified_collection_r2 still apply
    if (isCollection && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:verified_collection_r2',
        recommendedTemplate: 'method-of-verification',
        reason: 'Collection verified — demand method of verification under FCRA §1681i(a)(7); investigation pressure precedes any settlement consideration',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['623-direct-dispute', 'factual-errors-layer'],
      }, overrides);
    }
    // Collection (round 1 or general): furnisher dispute
    if (isCollection) {
      return applyOverride({
        scenarioKey: 'next:verified_collection',
        recommendedTemplate: '623-direct-dispute',
        reason: 'Collection verified — dispute directly with furnisher under FCRA §623',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['method-of-verification', 'ag-cfpb-escalation'],
      }, overrides);
    }
    // Metro 2 specific — method of verification
    if (hasMetro2Issues) {
      return applyOverride({
        scenarioKey: 'next:verified_metro2',
        recommendedTemplate: 'method-of-verification',
        reason: 'Verified despite Metro 2 violations — demand method of verification under FCRA §1681i(a)(7)',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['metro2-inconsistency-dispute', 'ag-cfpb-escalation'],
      }, overrides);
    }
    // Default verified (round 2): method-of-verification per FCRA §1681i(a)(7)
    if (round >= 2) {
      return applyOverride({
        scenarioKey: 'next:verified_method',
        recommendedTemplate: 'method-of-verification',
        reason: 'Item verified — request a description of the reinvestigation procedure used under FCRA §1681i(a)(7); this is available after any reinvestigation result',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['623-direct-dispute', 'factual-errors-layer'],
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:verified_default',
      recommendedTemplate: 'method-of-verification',
      reason: 'Item verified — request method of verification and procedure description under FCRA §1681i(a)(7)',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['623-direct-dispute', '611-general-dispute'],
    }, overrides);
  }

  // ── Stalled ───────────────────────────────────────────────────────────
  if (result === 'stalled') {
    if (round >= 3) {
      return applyOverride({
        scenarioKey: 'next:stalled_r3',
        recommendedTemplate: 'arbitration-election',
        reason: 'Dispute stalled after multiple rounds — elect arbitration to force resolution',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['ag-cfpb-escalation'],
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:stalled_default',
      recommendedTemplate: '623-direct-dispute',
      reason: 'Dispute stalled — bypass bureaus and dispute directly with furnisher under FCRA §623',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['ag-cfpb-escalation', 'method-of-verification'],
    }, overrides);
  }

  // ── Partial correction ────────────────────────────────────────────────
  if (result === 'partial') {
    if (hasGoodwillEligible) {
      return applyOverride({
        scenarioKey: 'next:partial_goodwill',
        recommendedTemplate: 'goodwill-removal',
        reason: 'Partial correction on a late payment account — request goodwill removal of remaining notations',
        urgency: 'low',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'method-of-verification'],
      }, overrides);
    }
    if (isCollection) {
      return applyOverride({
        scenarioKey: 'next:partial_collection',
        recommendedTemplate: '623-direct-dispute',
        reason: 'Partial correction on collection — dispute remaining inaccuracies directly with the furnisher',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['factual-errors-layer', 'method-of-verification'],
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:partial_default',
      recommendedTemplate: 'factual-errors-layer',
      reason: 'Partial correction received — dispute remaining inaccuracies with a targeted evidence layer',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute'],
    }, overrides);
  }

  // ── Updated ───────────────────────────────────────────────────────────
  if (result === 'updated') {
    return applyOverride({
      scenarioKey: 'next:updated',
      recommendedTemplate: 'method-of-verification',
      reason: 'Item updated but may still be inaccurate — request method of verification under FCRA §1681i(a)(7)',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute'],
    }, overrides);
  }

  // ── Round 3+ fallback (evidence-based) ───────────────────────────────
  if (round >= 3) {
    if (hasMetro2Issues) {
      return applyOverride({
        scenarioKey: 'next:r3_metro2',
        recommendedTemplate: 'metro2-deletion-demand',
        reason: 'Multiple dispute rounds with ongoing Metro 2 violations — demand deletion under FCRA §607(b)',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['ag-cfpb-escalation', 'arbitration-election'],
      }, overrides);
    }
    if (hasStrongEvidence) {
      return applyOverride({
        scenarioKey: 'next:r3_default',
        recommendedTemplate: 'ag-cfpb-escalation',
        reason: 'Multiple dispute rounds with documented unresolved inaccuracies — escalate with regulatory complaint citing specific failures',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['arbitration-election'],
      }, overrides);
    }
    // Weak evidence at round 3 — settlement as last resort
    return applyOverride({
      scenarioKey: 'next:pfd_last_resort',
      recommendedTemplate: 'pay-for-delete',
      reason: 'Multiple dispute rounds with no strong inaccuracy evidence remaining — consider settlement as a last-resort resolution path',
      urgency: 'medium',
      letterTarget: 'collector',
      alternativeTemplates: ['goodwill-removal', '623-direct-dispute'],
    }, overrides);
  }

  // ── Collection general (round 1-2, no specific outcome) ──────────────
  if (isCollection) {
    if (hasTimeBarred && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:collection_time_barred_r2',
        recommendedTemplate: 'fdcpa-time-barred',
        reason: 'Collection account with potential statute of limitations issue — demand proof debt is within the collectible period',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['obsolete-debt', 'debt-validation'],
      }, overrides);
    }
    if (round >= 2) {
      // Method-of-verification before PFD — investigation pressure first
      return applyOverride({
        scenarioKey: 'next:collection_r2_pfd',
        recommendedTemplate: 'method-of-verification',
        reason: 'Collection account after initial dispute — apply investigation pressure via method-of-verification before considering settlement',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['623-direct-dispute', 'factual-errors-layer'],
      }, overrides);
    }
    const template = prev.includes('debt-validation') ? '623-direct-dispute' : 'debt-validation';
    return applyOverride({
      scenarioKey: 'next:collection_default',
      recommendedTemplate: template,
      reason: !prev.includes('debt-validation')
        ? 'Collection account — request debt validation under FDCPA §809'
        : 'Follow up on collection — dispute directly with furnisher under FCRA §623',
      urgency: 'medium',
      letterTarget: tgt(template),
      alternativeTemplates: ['611-general-dispute', 'second-round-dispute'],
    }, overrides);
  }

  return applyOverride({
    scenarioKey: 'next:default',
    recommendedTemplate: 'method-of-verification',
    reason: 'Follow-up dispute recommended — apply investigation pressure with method-of-verification before escalating further',
    urgency: 'medium',
    letterTarget: 'bureau',
    alternativeTemplates: ['623-direct-dispute', 'second-round-dispute'],
  }, overrides);
}
