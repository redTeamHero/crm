import { LETTER_TEMPLATES } from './letterTemplates.js';

const templateMap = Object.fromEntries(LETTER_TEMPLATES.map(t => [t.id, t]));

function findTemplate(id) {
  return templateMap[id] || null;
}

function hasViolationType(violations, keywords) {
  if (!Array.isArray(violations) || violations.length === 0) return false;
  const lower = keywords.map(k => k.toLowerCase());
  return violations.some(v => {
    const text = (typeof v === 'string' ? v : (v.description || v.rule || v.violation || '')).toLowerCase();
    return lower.some(k => text.includes(k));
  });
}

export function recommendFirstLetter({ violations = [], accountType = '', accountStatus = '' }) {
  const type = (accountType || '').toLowerCase();
  const status = (accountStatus || '').toLowerCase();
  const hasViolations = Array.isArray(violations) && violations.length > 0;

  if (hasViolationType(violations, ['metro 2', 'metro2', 'compliance', 'inconsisten', 'field', 'segment', 'format'])) {
    return {
      recommendedTemplate: '611-general-dispute',
      reason: 'Metro 2 compliance inconsistencies detected — start with a general dispute citing specific field-level violations',
      urgency: 'high',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    };
  }

  if (hasViolationType(violations, ['obsolete', 'expired', 'seven year', '7 year', 'time-barred', 'statute of limitation'])) {
    return {
      recommendedTemplate: 'obsolete-debt',
      reason: 'Debt appears obsolete or past the reporting period — request removal under FCRA §1681c',
      urgency: 'high',
      alternativeTemplates: ['611-general-dispute']
    };
  }

  if (status.includes('bankrupt') || type.includes('bankrupt') || hasViolationType(violations, ['bankrupt', 'discharge'])) {
    return {
      recommendedTemplate: 'bankruptcy-misreporting',
      reason: 'Bankruptcy-related item detected — dispute incorrect post-discharge reporting',
      urgency: 'high',
      alternativeTemplates: ['611-general-dispute']
    };
  }

  if (status.includes('collection') || type.includes('collection') || type.includes('debt') || hasViolationType(violations, ['collection', 'collector', 'debt buyer', 'purchased'])) {
    return {
      recommendedTemplate: 'debt-validation',
      reason: 'Collection account — request full debt validation under FDCPA §809 before proceeding',
      urgency: 'medium',
      alternativeTemplates: ['611-general-dispute', 'cease-and-desist']
    };
  }

  if (hasViolationType(violations, ['reinsert', 're-insert', 'reappear', 'previously deleted'])) {
    return {
      recommendedTemplate: 'reinsertion-dispute',
      reason: 'Item appears to have been reinserted without proper notice — dispute under FCRA §611(a)(5)(B)',
      urgency: 'high',
      alternativeTemplates: ['611-general-dispute']
    };
  }

  if (hasViolations) {
    return {
      recommendedTemplate: '611-general-dispute',
      reason: 'Inaccuracies detected — file a general dispute under FCRA §611 for investigation',
      urgency: 'medium',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    };
  }

  return {
    recommendedTemplate: '611-general-dispute',
    reason: 'General dispute recommended — request investigation under FCRA §611',
    urgency: 'low',
    alternativeTemplates: ['609-disclosure']
  };
}

export function recommendNextLetter({ letterType = '', round = 1, outcome = '', violations = [] }) {
  const prev = (letterType || '').toLowerCase();
  const result = (outcome || '').toLowerCase();

  if (result === 'removed' || result === 'deleted' || result === 'corrected') {
    return {
      recommendedTemplate: null,
      reason: 'Item has been removed or corrected — no further action needed',
      urgency: 'none',
      alternativeTemplates: []
    };
  }

  if (result === 'no_response' || result === 'no response') {
    if (round >= 3) {
      return {
        recommendedTemplate: 'ag-cfpb-escalation',
        reason: 'No response after multiple rounds — escalate with AG/CFPB complaint threat',
        urgency: 'high',
        alternativeTemplates: ['arbitration-election']
      };
    }
    return {
      recommendedTemplate: 'second-round-dispute',
      reason: 'No response received — send escalation dispute demanding proper reinvestigation',
      urgency: 'high',
      alternativeTemplates: ['ag-cfpb-escalation', 'method-of-verification']
    };
  }

  if (result === 'verified') {
    if (round >= 3) {
      return {
        recommendedTemplate: 'ag-cfpb-escalation',
        reason: 'Item verified multiple times without adequate proof — escalate to regulators',
        urgency: 'high',
        alternativeTemplates: ['arbitration-election', '623-direct-dispute']
      };
    }
    return {
      recommendedTemplate: '609-disclosure',
      reason: 'Item verified without adequate proof — request full disclosure under FCRA §609',
      urgency: 'medium',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    };
  }

  if (result === 'stalled') {
    if (round >= 3) {
      return {
        recommendedTemplate: 'arbitration-election',
        reason: 'Dispute stalled after multiple rounds — elect arbitration to force resolution',
        urgency: 'high',
        alternativeTemplates: ['ag-cfpb-escalation']
      };
    }
    return {
      recommendedTemplate: '623-direct-dispute',
      reason: 'Dispute stalled — bypass bureaus and dispute directly with furnisher under FCRA §623',
      urgency: 'medium',
      alternativeTemplates: ['ag-cfpb-escalation', 'method-of-verification']
    };
  }

  if (result === 'partial') {
    return {
      recommendedTemplate: '611-general-dispute',
      reason: 'Partial correction received — dispute remaining inaccuracies under FCRA §611',
      urgency: 'medium',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    };
  }

  if (round >= 3) {
    return {
      recommendedTemplate: 'ag-cfpb-escalation',
      reason: 'Multiple dispute rounds completed — escalate with regulatory complaint',
      urgency: 'high',
      alternativeTemplates: ['arbitration-election']
    };
  }

  return {
    recommendedTemplate: 'second-round-dispute',
    reason: 'Follow-up dispute recommended — escalate with reinvestigation demand',
    urgency: 'medium',
    alternativeTemplates: ['method-of-verification', '623-direct-dispute']
  };
}
