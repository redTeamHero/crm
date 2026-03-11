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

export function recommendNextLetter({ letterType = '', round = 1, outcome = '', violations = [], accountType = '', accountStatus = '' }) {
  const prev = (letterType || '').toLowerCase();
  const result = (outcome || '').toLowerCase();
  const type = (accountType || '').toLowerCase();
  const status = (accountStatus || '').toLowerCase();
  const isCollection = type.includes('collection') || type.includes('debt') || status.includes('collection');
  const hasBankruptcy = status.includes('bankrupt') || type.includes('bankrupt') || hasViolationType(violations, ['bankrupt', 'discharge']);
  const hasMetro2Issues = hasViolationType(violations, ['metro 2', 'metro2', 'compliance', 'inconsisten', 'field', 'segment', 'format']);
  const hasObsolete = hasViolationType(violations, ['obsolete', 'expired', 'seven year', '7 year', 'time-barred', 'statute of limitation']);

  if (result === 'removed' || result === 'deleted' || result === 'corrected') {
    return {
      recommendedTemplate: null,
      reason: 'Item has been removed or corrected — no further action needed',
      urgency: 'none',
      alternativeTemplates: []
    };
  }

  if (result === 'awaiting' || result === 'awaiting_response') {
    if (isCollection) {
      return {
        recommendedTemplate: prev.includes('debt-validation') ? 'second-round-dispute' : 'debt-validation',
        reason: isCollection && !prev.includes('debt-validation')
          ? 'Collection account still awaiting — send debt validation request under FDCPA §809'
          : 'Collection account awaiting response — follow up with escalated dispute',
        urgency: 'medium',
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
      };
    }
    if (hasBankruptcy) {
      return {
        recommendedTemplate: 'bankruptcy-misreporting',
        reason: 'Bankruptcy-related item awaiting response — follow up on discharge reporting',
        urgency: 'medium',
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
      };
    }
    if (hasObsolete) {
      return {
        recommendedTemplate: 'obsolete-debt',
        reason: 'Obsolete debt awaiting response — reiterate removal request under FCRA §1681c',
        urgency: 'medium',
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
      };
    }
    if (hasMetro2Issues) {
      return {
        recommendedTemplate: '611-general-dispute',
        reason: 'Metro 2 compliance issues awaiting response — follow up citing specific violations',
        urgency: 'medium',
        alternativeTemplates: ['second-round-dispute', 'method-of-verification']
      };
    }
    return {
      recommendedTemplate: 'second-round-dispute',
      reason: 'Item still awaiting response — send follow-up dispute demanding reinvestigation',
      urgency: 'medium',
      alternativeTemplates: ['611-general-dispute', 'method-of-verification']
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
    if (isCollection) {
      return {
        recommendedTemplate: prev.includes('debt-validation') ? 'second-round-dispute' : 'debt-validation',
        reason: isCollection && !prev.includes('debt-validation')
          ? 'No response on collection account — demand debt validation under FDCPA §809'
          : 'No response after debt validation — escalate with second-round dispute',
        urgency: 'high',
        alternativeTemplates: ['ag-cfpb-escalation', '623-direct-dispute']
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
    if (isCollection) {
      return {
        recommendedTemplate: '623-direct-dispute',
        reason: 'Collection verified — dispute directly with furnisher under FCRA §623',
        urgency: 'medium',
        alternativeTemplates: ['method-of-verification', 'ag-cfpb-escalation']
      };
    }
    if (hasMetro2Issues) {
      return {
        recommendedTemplate: 'method-of-verification',
        reason: 'Verified despite Metro 2 violations — demand method of verification under FCRA §611(a)(7)',
        urgency: 'medium',
        alternativeTemplates: ['623-direct-dispute', 'ag-cfpb-escalation']
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
    if (isCollection) {
      return {
        recommendedTemplate: '623-direct-dispute',
        reason: 'Partial correction on collection — dispute directly with furnisher for remaining inaccuracies',
        urgency: 'medium',
        alternativeTemplates: ['611-general-dispute', 'method-of-verification']
      };
    }
    return {
      recommendedTemplate: '611-general-dispute',
      reason: 'Partial correction received — dispute remaining inaccuracies under FCRA §611',
      urgency: 'medium',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    };
  }

  if (result === 'updated') {
    return {
      recommendedTemplate: 'method-of-verification',
      reason: 'Item updated but may still be inaccurate — request method of verification under FCRA §611(a)(7)',
      urgency: 'medium',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute']
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

  if (isCollection) {
    return {
      recommendedTemplate: prev.includes('debt-validation') ? '623-direct-dispute' : 'debt-validation',
      reason: isCollection && !prev.includes('debt-validation')
        ? 'Collection account — request debt validation under FDCPA §809'
        : 'Follow up on collection — dispute directly with furnisher under FCRA §623',
      urgency: 'medium',
      alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
    };
  }

  return {
    recommendedTemplate: 'second-round-dispute',
    reason: 'Follow-up dispute recommended — escalate with reinvestigation demand',
    urgency: 'medium',
    alternativeTemplates: ['method-of-verification', '623-direct-dispute']
  };
}
