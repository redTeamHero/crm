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
  { group: 'First Round', key: 'first:medical_collection',      label: 'Medical debt in collections',              defaultTemplate: 'hipaa-medical-debt' },
  { group: 'First Round', key: 'first:harassment_collection',   label: 'Harassment / abusive collection',          defaultTemplate: 'fdcpa-harassment' },
  { group: 'First Round', key: 'first:time_barred_collection',  label: 'Time-barred debt (collection)',            defaultTemplate: 'fdcpa-time-barred' },
  { group: 'First Round', key: 'first:metro2_inconsistency',    label: 'Metro 2 inconsistency / compliance',       defaultTemplate: 'metro2-inconsistency-dispute' },
  { group: 'First Round', key: 'first:obsolete_debt',           label: 'Obsolete / expired debt',                 defaultTemplate: 'obsolete-debt' },
  { group: 'First Round', key: 'first:bankruptcy',              label: 'Bankruptcy misreporting',                  defaultTemplate: 'bankruptcy-misreporting' },
  { group: 'First Round', key: 'first:tila_loan',               label: 'TILA disclosure violation (loan)',         defaultTemplate: 'tila-disclosure' },
  { group: 'First Round', key: 'first:general_collection',      label: 'General collection account',              defaultTemplate: 'debt-validation' },
  { group: 'First Round', key: 'first:reinsertion',             label: 'Re-inserted / reappearing item',          defaultTemplate: 'reinsertion-dispute' },
  { group: 'First Round', key: 'first:late_payment_only',       label: 'Late payment only (goodwill eligible)',   defaultTemplate: 'goodwill-removal' },
  { group: 'First Round', key: 'first:violations_general',      label: 'General inaccuracies (has violations)',   defaultTemplate: '611-general-dispute' },
  { group: 'First Round', key: 'first:default',                 label: 'Default (no specific match)',             defaultTemplate: '611-general-dispute' },

  { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_time_barred',   label: 'Awaiting — time-barred collection (round 2+)',  defaultTemplate: 'fdcpa-time-barred' },
  { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_collection',    label: 'Awaiting — general collection',                 defaultTemplate: 'debt-validation' },
  { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_bankruptcy',    label: 'Awaiting — bankruptcy',                        defaultTemplate: 'bankruptcy-misreporting' },
  { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_obsolete',      label: 'Awaiting — obsolete debt',                     defaultTemplate: 'obsolete-debt' },
  { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_metro2',        label: 'Awaiting — Metro 2 issues',                    defaultTemplate: 'metro2-inconsistency-dispute' },
  { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_default',       label: 'Awaiting — default',                           defaultTemplate: 'second-round-dispute' },

  { group: 'Follow-up: No Response',       key: 'next:no_response_pfd',           label: 'No response — pay-for-delete offer',              defaultTemplate: 'pay-for-delete-followup' },
  { group: 'Follow-up: No Response',       key: 'next:no_response_time_barred',   label: 'No response — time-barred (round 2+)',            defaultTemplate: 'fdcpa-time-barred' },
  { group: 'Follow-up: No Response',       key: 'next:no_response_metro2_r3',     label: 'No response — Metro 2 (round 3+)',               defaultTemplate: 'metro2-deletion-demand' },
  { group: 'Follow-up: No Response',       key: 'next:no_response_r3',            label: 'No response — escalation (round 3+)',             defaultTemplate: 'ag-cfpb-escalation' },
  { group: 'Follow-up: No Response',       key: 'next:no_response_collection_r2', label: 'No response — collection round 2+ (PFD)',         defaultTemplate: 'pay-for-delete' },
  { group: 'Follow-up: No Response',       key: 'next:no_response_collection',    label: 'No response — general collection',                defaultTemplate: 'debt-validation' },
  { group: 'Follow-up: No Response',       key: 'next:no_response_factual_r2',    label: 'No response — factual errors (round 2+)',         defaultTemplate: 'factual-errors-layer' },
  { group: 'Follow-up: No Response',       key: 'next:no_response_default',       label: 'No response — default',                          defaultTemplate: 'second-round-dispute' },

  { group: 'Follow-up: Verified',          key: 'next:verified_metro2_r3',        label: 'Verified — Metro 2 (round 3+)',                   defaultTemplate: 'metro2-deletion-demand' },
  { group: 'Follow-up: Verified',          key: 'next:verified_r3',               label: 'Verified — escalation (round 3+)',                defaultTemplate: 'ag-cfpb-escalation' },
  { group: 'Follow-up: Verified',          key: 'next:verified_collection_r2',    label: 'Verified — collection round 2+ (PFD)',            defaultTemplate: 'pay-for-delete' },
  { group: 'Follow-up: Verified',          key: 'next:verified_collection',       label: 'Verified — collection default',                   defaultTemplate: '623-direct-dispute' },
  { group: 'Follow-up: Verified',          key: 'next:verified_factual',          label: 'Verified — factual errors',                      defaultTemplate: 'factual-errors-layer' },
  { group: 'Follow-up: Verified',          key: 'next:verified_metro2',           label: 'Verified — Metro 2 (method of verification)',    defaultTemplate: 'method-of-verification' },
  { group: 'Follow-up: Verified',          key: 'next:verified_default',          label: 'Verified — default',                             defaultTemplate: '609-disclosure' },

  { group: 'Follow-up: Other Outcomes',    key: 'next:medical_collection',        label: 'Medical collection follow-up',                    defaultTemplate: 'hipaa-medical-debt' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:harassment_collection',     label: 'Harassment follow-up',                           defaultTemplate: 'fdcpa-harassment' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:stalled_r3',               label: 'Stalled — round 3+ (arbitration)',                defaultTemplate: 'arbitration-election' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:stalled_default',           label: 'Stalled — default',                              defaultTemplate: '623-direct-dispute' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:partial_goodwill',          label: 'Partial correction — goodwill eligible',         defaultTemplate: 'goodwill-removal' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:partial_collection',        label: 'Partial correction — collection',                 defaultTemplate: '623-direct-dispute' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:partial_default',           label: 'Partial correction — default',                   defaultTemplate: '611-general-dispute' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:updated',                   label: 'Item updated — verification request',            defaultTemplate: 'method-of-verification' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:r3_metro2',                 label: 'Round 3+ — Metro 2 deletion demand',             defaultTemplate: 'metro2-deletion-demand' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:r3_default',               label: 'Round 3+ — escalation',                          defaultTemplate: 'ag-cfpb-escalation' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:collection_time_barred_r2', label: 'Collection — time-barred round 2+',              defaultTemplate: 'fdcpa-time-barred' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:collection_r2_pfd',         label: 'Collection — round 2+ (PFD)',                    defaultTemplate: 'pay-for-delete' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:collection_default',        label: 'Collection — default',                           defaultTemplate: 'debt-validation' },
  { group: 'Follow-up: Other Outcomes',    key: 'next:default',                   label: 'Default follow-up',                              defaultTemplate: 'second-round-dispute' },
];

export function recommendFirstLetter({ violations = [], accountType = '', accountStatus = '' }, overrides = {}) {
  const type = (accountType || '').toLowerCase();
  const status = (accountStatus || '').toLowerCase();
  const hasViolations = Array.isArray(violations) && violations.length > 0;

  const isMedical = type.includes('medical') || type.includes('health') || type.includes('hospital')
    || status.includes('medical') || status.includes('health')
    || hasViolationType(violations, ['medical', 'hipaa', 'health', 'hospital', 'healthcare', 'physician', 'clinic']);

  const isCollection = status.includes('collection') || type.includes('collection') || type.includes('debt')
    || hasViolationType(violations, ['collection', 'collector', 'debt buyer', 'purchased']);

  const isLoan = type.includes('loan') || type.includes('mortgage') || type.includes('installment')
    || type.includes('auto') || type.includes('personal') || type.includes('student');

  const hasHarassment = hasViolationType(violations, ['harassment', 'excessive call', 'abusive', 'intimidat', 'threaten', 'harass']);

  const hasTimeBarred = hasViolationType(violations, ['time-barred', 'time barred', 'statute of limitation', 'sol expired', 'barred by statute', ' sol ', '(sol)', 'sol)']);

  const hasLatePaymentOnly = hasViolationType(violations, ['late payment', 'late pay', 'goodwill', 'isolated late', '30 day late', '60 day late', '90 day late'])
    && !status.includes('collection') && !status.includes('charge-off') && !status.includes('charge off')
    && !type.includes('collection') && !type.includes('debt');

  const hasTILA = hasViolationType(violations, ['tila', 'truth in lending', 'finance charge', 'annual percentage rate', 'apr violation', 'disclosure required', 'rescission', 'right to cancel']);

  if (isMedical && isCollection) {
    return applyOverride({
      scenarioKey: 'first:medical_collection',
      recommendedTemplate: 'hipaa-medical-debt',
      reason: 'Medical debt in collections — request HIPAA authorization and full itemized validation under FDCPA §809',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['debt-validation', 'cease-and-desist']
    }, overrides);
  }

  if (hasHarassment && isCollection) {
    return applyOverride({
      scenarioKey: 'first:harassment_collection',
      recommendedTemplate: 'fdcpa-harassment',
      reason: 'Harassment or abusive collection conduct detected — formally document and demand it stop under FDCPA §806',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['cease-and-desist', 'debt-validation']
    }, overrides);
  }

  if (hasTimeBarred && isCollection) {
    return applyOverride({
      scenarioKey: 'first:time_barred_collection',
      recommendedTemplate: 'fdcpa-time-barred',
      reason: 'Debt appears to be past the statute of limitations — request proof the debt is still collectible under FDCPA',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['obsolete-debt', 'debt-validation']
    }, overrides);
  }

  if (hasViolationType(violations, ['metro 2', 'metro2', 'compliance', 'inconsisten', 'field', 'segment', 'format'])) {
    return applyOverride({
      scenarioKey: 'first:metro2_inconsistency',
      recommendedTemplate: 'metro2-inconsistency-dispute',
      reason: 'Metro 2 compliance inconsistencies detected — dispute specific field-level violations and demand corrected data submission',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute']
    }, overrides);
  }

  if (hasViolationType(violations, ['obsolete', 'expired', 'seven year', '7 year', 'time-barred', 'statute of limitation'])) {
    return applyOverride({
      scenarioKey: 'first:obsolete_debt',
      recommendedTemplate: 'obsolete-debt',
      reason: 'Debt appears obsolete or past the reporting period — request removal under FCRA §1681c',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute']
    }, overrides);
  }

  if (status.includes('bankrupt') || type.includes('bankrupt') || hasViolationType(violations, ['bankrupt', 'discharge'])) {
    return applyOverride({
      scenarioKey: 'first:bankruptcy',
      recommendedTemplate: 'bankruptcy-misreporting',
      reason: 'Bankruptcy-related item detected — dispute incorrect post-discharge reporting',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute']
    }, overrides);
  }

  if (hasTILA && isLoan) {
    return applyOverride({
      scenarioKey: 'first:tila_loan',
      recommendedTemplate: 'tila-disclosure',
      reason: 'Loan account with disclosure violations — demand full TILA disclosure of rates, fees, and payment terms',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute']
    }, overrides);
  }

  if (isCollection) {
    return applyOverride({
      scenarioKey: 'first:general_collection',
      recommendedTemplate: 'debt-validation',
      reason: 'Collection account — request full debt validation under FDCPA §809 before proceeding',
      urgency: 'medium',
      letterTarget: 'collector',
      alternativeTemplates: ['611-general-dispute', 'cease-and-desist']
    }, overrides);
  }

  if (hasViolationType(violations, ['reinsert', 're-insert', 'reappear', 'previously deleted'])) {
    return applyOverride({
      scenarioKey: 'first:reinsertion',
      recommendedTemplate: 'reinsertion-dispute',
      reason: 'Item appears to have been reinserted without proper notice — dispute under FCRA §611(a)(5)(B)',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute']
    }, overrides);
  }

  if (hasLatePaymentOnly) {
    return applyOverride({
      scenarioKey: 'first:late_payment_only',
      recommendedTemplate: 'goodwill-removal',
      reason: 'Late payment notation on otherwise current account — request goodwill removal from the creditor',
      urgency: 'low',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute']
    }, overrides);
  }

  if (hasViolations) {
    return applyOverride({
      scenarioKey: 'first:violations_general',
      recommendedTemplate: '611-general-dispute',
      reason: 'Inaccuracies detected — file a general dispute under FCRA §611 for investigation',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    }, overrides);
  }

  return applyOverride({
    scenarioKey: 'first:default',
    recommendedTemplate: '611-general-dispute',
    reason: 'General dispute recommended — request investigation under FCRA §611',
    urgency: 'low',
    letterTarget: 'bureau',
    alternativeTemplates: ['609-disclosure']
  }, overrides);
}

export function recommendNextLetter({ letterType = '', round = 1, outcome = '', violations = [], accountType = '', accountStatus = '' }, overrides = {}) {
  const prev = (letterType || '').toLowerCase();
  const result = (outcome || '').toLowerCase();
  const type = (accountType || '').toLowerCase();
  const status = (accountStatus || '').toLowerCase();

  const isCollection = type.includes('collection') || type.includes('debt') || status.includes('collection');
  const isMedical = type.includes('medical') || type.includes('health') || type.includes('hospital')
    || status.includes('medical') || status.includes('health')
    || hasViolationType(violations, ['medical', 'hipaa', 'health', 'hospital', 'healthcare', 'physician', 'clinic']);
  const hasBankruptcy = status.includes('bankrupt') || type.includes('bankrupt') || hasViolationType(violations, ['bankrupt', 'discharge']);
  const hasMetro2Issues = hasViolationType(violations, ['metro 2', 'metro2', 'compliance', 'inconsisten', 'field', 'segment', 'format']);
  const hasObsolete = hasViolationType(violations, ['obsolete', 'expired', 'seven year', '7 year', 'time-barred', 'statute of limitation']);
  const hasHarassment = hasViolationType(violations, ['harassment', 'excessive call', 'abusive', 'intimidat', 'threaten', 'harass']);
  const hasTimeBarred = hasViolationType(violations, ['time-barred', 'time barred', 'statute of limitation', 'sol expired', 'barred by statute', ' sol ', '(sol)', 'sol)']);
  const hasFactualErrors = hasViolationType(violations, ['factual', 'incorrect date', 'balance error', 'wrong date', 'incorrect balance', 'date error']);
  const hasGoodwillEligible = hasViolationType(violations, ['late payment', 'late pay', 'goodwill', 'isolated late', '30 day late', '60 day late'])
    && !status.includes('collection') && !status.includes('charge-off') && !status.includes('charge off')
    && !type.includes('collection') && !type.includes('debt');
  const hasPFDContext = hasViolationType(violations, ['pay for delete', 'pay-for-delete', 'settlement offer', 'conditional settlement', 'delete in exchange']);
  const prevIsPFD = prev.includes('pay-for-delete') || hasPFDContext;

  if (result === 'removed' || result === 'deleted' || result === 'corrected') {
    return {
      scenarioKey: null,
      recommendedTemplate: null,
      reason: 'Item has been removed or corrected — no further action needed',
      urgency: 'none',
      letterTarget: 'bureau',
      alternativeTemplates: []
    };
  }

  if (isMedical && isCollection) {
    return applyOverride({
      scenarioKey: 'next:medical_collection',
      recommendedTemplate: 'hipaa-medical-debt',
      reason: 'Medical collection account — request HIPAA authorization, itemized billing, and insurance verification under FDCPA §809',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['debt-validation', 'cease-and-desist']
    }, overrides);
  }

  if (hasHarassment && isCollection) {
    return applyOverride({
      scenarioKey: 'next:harassment_collection',
      recommendedTemplate: 'fdcpa-harassment',
      reason: 'Harassment or abusive conduct from collector — demand it stop immediately under FDCPA §806',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['cease-and-desist', 'debt-validation']
    }, overrides);
  }

  if (result === 'awaiting' || result === 'awaiting_response') {
    if (hasTimeBarred && isCollection && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:awaiting_time_barred',
        recommendedTemplate: 'fdcpa-time-barred',
        reason: 'Collection account still awaiting — debt may be time-barred; demand proof it is within the statute of limitations',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', 'obsolete-debt']
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
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
      }, overrides);
    }
    if (hasBankruptcy) {
      return applyOverride({
        scenarioKey: 'next:awaiting_bankruptcy',
        recommendedTemplate: 'bankruptcy-misreporting',
        reason: 'Bankruptcy-related item awaiting response — follow up on discharge reporting',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
      }, overrides);
    }
    if (hasObsolete) {
      return applyOverride({
        scenarioKey: 'next:awaiting_obsolete',
        recommendedTemplate: 'obsolete-debt',
        reason: 'Obsolete debt awaiting response — reiterate removal request under FCRA §1681c',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
      }, overrides);
    }
    if (hasMetro2Issues) {
      return applyOverride({
        scenarioKey: 'next:awaiting_metro2',
        recommendedTemplate: 'metro2-inconsistency-dispute',
        reason: 'Metro 2 compliance issues still awaiting response — follow up demanding corrected data submission',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['second-round-dispute', 'method-of-verification']
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:awaiting_default',
      recommendedTemplate: 'second-round-dispute',
      reason: 'Item still awaiting response — send follow-up dispute demanding reinvestigation',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', 'method-of-verification']
    }, overrides);
  }

  if (result === 'no_response' || result === 'no response') {
    if (prevIsPFD) {
      return applyOverride({
        scenarioKey: 'next:no_response_pfd',
        recommendedTemplate: 'pay-for-delete-followup',
        reason: 'No response to pay-for-delete offer — renew the settlement offer with a firm deadline',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', 'ag-cfpb-escalation']
      }, overrides);
    }
    if (hasTimeBarred && isCollection && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:no_response_time_barred',
        recommendedTemplate: 'fdcpa-time-barred',
        reason: 'No response on collection account — debt may be time-barred; demand proof it is within statute of limitations',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', 'obsolete-debt']
      }, overrides);
    }
    if (round >= 3) {
      if (hasMetro2Issues) {
        return applyOverride({
          scenarioKey: 'next:no_response_metro2_r3',
          recommendedTemplate: 'metro2-deletion-demand',
          reason: 'No response after multiple rounds with Metro 2 violations — demand deletion under FCRA §607(b) and §611',
          urgency: 'high',
          letterTarget: 'bureau',
          alternativeTemplates: ['ag-cfpb-escalation', 'arbitration-election']
        }, overrides);
      }
      return applyOverride({
        scenarioKey: 'next:no_response_r3',
        recommendedTemplate: 'ag-cfpb-escalation',
        reason: 'No response after multiple rounds — escalate with AG/CFPB complaint threat',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['arbitration-election']
      }, overrides);
    }
    if (isCollection) {
      if (round >= 2 && !prev.includes('pay-for-delete')) {
        return applyOverride({
          scenarioKey: 'next:no_response_collection_r2',
          recommendedTemplate: 'pay-for-delete',
          reason: 'No response from collector after multiple rounds — propose conditional pay-for-delete settlement at 40%',
          urgency: 'high',
          letterTarget: 'collector',
          alternativeTemplates: ['debt-validation', 'ag-cfpb-escalation']
        }, overrides);
      }
      const template = prev.includes('debt-validation') ? 'second-round-dispute' : 'debt-validation';
      return applyOverride({
        scenarioKey: 'next:no_response_collection',
        recommendedTemplate: template,
        reason: !prev.includes('debt-validation')
          ? 'No response on collection account — demand debt validation under FDCPA §809'
          : 'No response after debt validation — escalate with second-round dispute',
        urgency: 'high',
        letterTarget: tgt(template),
        alternativeTemplates: ['ag-cfpb-escalation', '623-direct-dispute']
      }, overrides);
    }
    if (hasFactualErrors && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:no_response_factual_r2',
        recommendedTemplate: 'factual-errors-layer',
        reason: 'No response despite documented factual errors — submit additional evidence and demand reopened investigation',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['second-round-dispute', 'method-of-verification']
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:no_response_default',
      recommendedTemplate: 'second-round-dispute',
      reason: 'No response received — send escalation dispute demanding proper reinvestigation',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['ag-cfpb-escalation', 'method-of-verification']
    }, overrides);
  }

  if (result === 'verified') {
    if (round >= 3) {
      if (hasMetro2Issues) {
        return applyOverride({
          scenarioKey: 'next:verified_metro2_r3',
          recommendedTemplate: 'metro2-deletion-demand',
          reason: 'Verified multiple times despite Metro 2 violations — demand deletion under FCRA §607(b) and §611',
          urgency: 'high',
          letterTarget: 'bureau',
          alternativeTemplates: ['ag-cfpb-escalation', 'arbitration-election']
        }, overrides);
      }
      return applyOverride({
        scenarioKey: 'next:verified_r3',
        recommendedTemplate: 'ag-cfpb-escalation',
        reason: 'Item verified multiple times without adequate proof — escalate to regulators',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['arbitration-election', '623-direct-dispute']
      }, overrides);
    }
    if (isCollection) {
      if (round >= 2 && !prevIsPFD) {
        return applyOverride({
          scenarioKey: 'next:verified_collection_r2',
          recommendedTemplate: 'pay-for-delete',
          reason: 'Collection verified — propose conditional pay-for-delete settlement to resolve without ongoing credit damage',
          urgency: 'medium',
          letterTarget: 'collector',
          alternativeTemplates: ['623-direct-dispute', 'method-of-verification']
        }, overrides);
      }
      return applyOverride({
        scenarioKey: 'next:verified_collection',
        recommendedTemplate: '623-direct-dispute',
        reason: 'Collection verified — dispute directly with furnisher under FCRA §623',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['method-of-verification', 'ag-cfpb-escalation']
      }, overrides);
    }
    if (hasFactualErrors) {
      return applyOverride({
        scenarioKey: 'next:verified_factual',
        recommendedTemplate: 'factual-errors-layer',
        reason: 'Verified despite documented factual errors — submit evidence layer to force substantive re-examination',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['method-of-verification', '623-direct-dispute']
      }, overrides);
    }
    if (hasMetro2Issues) {
      return applyOverride({
        scenarioKey: 'next:verified_metro2',
        recommendedTemplate: 'method-of-verification',
        reason: 'Verified despite Metro 2 violations — demand method of verification under FCRA §611(a)(7)',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['metro2-inconsistency-dispute', 'ag-cfpb-escalation']
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:verified_default',
      recommendedTemplate: '609-disclosure',
      reason: 'Item verified without adequate proof — request full disclosure under FCRA §609',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    }, overrides);
  }

  if (result === 'stalled') {
    if (round >= 3) {
      return applyOverride({
        scenarioKey: 'next:stalled_r3',
        recommendedTemplate: 'arbitration-election',
        reason: 'Dispute stalled after multiple rounds — elect arbitration to force resolution',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['ag-cfpb-escalation']
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:stalled_default',
      recommendedTemplate: '623-direct-dispute',
      reason: 'Dispute stalled — bypass bureaus and dispute directly with furnisher under FCRA §623',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['ag-cfpb-escalation', 'method-of-verification']
    }, overrides);
  }

  if (result === 'partial') {
    if (hasGoodwillEligible) {
      return applyOverride({
        scenarioKey: 'next:partial_goodwill',
        recommendedTemplate: 'goodwill-removal',
        reason: 'Partial correction received on a late payment account — request goodwill removal of remaining notations',
        urgency: 'low',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'method-of-verification']
      }, overrides);
    }
    if (isCollection) {
      return applyOverride({
        scenarioKey: 'next:partial_collection',
        recommendedTemplate: '623-direct-dispute',
        reason: 'Partial correction on collection — dispute directly with furnisher for remaining inaccuracies',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'method-of-verification']
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:partial_default',
      recommendedTemplate: '611-general-dispute',
      reason: 'Partial correction received — dispute remaining inaccuracies under FCRA §611',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    }, overrides);
  }

  if (result === 'updated') {
    return applyOverride({
      scenarioKey: 'next:updated',
      recommendedTemplate: 'method-of-verification',
      reason: 'Item updated but may still be inaccurate — request method of verification under FCRA §611(a)(7)',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute']
    }, overrides);
  }

  if (round >= 3) {
    if (hasMetro2Issues) {
      return applyOverride({
        scenarioKey: 'next:r3_metro2',
        recommendedTemplate: 'metro2-deletion-demand',
        reason: 'Multiple dispute rounds completed with ongoing Metro 2 violations — demand deletion under FCRA §607(b)',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['ag-cfpb-escalation', 'arbitration-election']
      }, overrides);
    }
    return applyOverride({
      scenarioKey: 'next:r3_default',
      recommendedTemplate: 'ag-cfpb-escalation',
      reason: 'Multiple dispute rounds completed — escalate with regulatory complaint',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['arbitration-election']
    }, overrides);
  }

  if (isCollection) {
    if (hasTimeBarred && round >= 2) {
      return applyOverride({
        scenarioKey: 'next:collection_time_barred_r2',
        recommendedTemplate: 'fdcpa-time-barred',
        reason: 'Collection account with potential statute of limitations issue — demand proof debt is within the collectible period',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['obsolete-debt', 'debt-validation']
      }, overrides);
    }
    if (round >= 2 && !prevIsPFD) {
      return applyOverride({
        scenarioKey: 'next:collection_r2_pfd',
        recommendedTemplate: 'pay-for-delete',
        reason: 'Collection account persisting after initial dispute — propose conditional pay-for-delete settlement at 40%',
        urgency: 'medium',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', '623-direct-dispute']
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
      alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
    }, overrides);
  }

  return applyOverride({
    scenarioKey: 'next:default',
    recommendedTemplate: 'second-round-dispute',
    reason: 'Follow-up dispute recommended — escalate with reinvestigation demand',
    urgency: 'medium',
    letterTarget: 'bureau',
    alternativeTemplates: ['method-of-verification', '623-direct-dispute']
  }, overrides);
}
