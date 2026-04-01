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

export function recommendFirstLetter({ violations = [], accountType = '', accountStatus = '' }) {
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

  const hasTimeBarred = hasViolationType(violations, ['time-barred', 'time barred', 'statute of limitation', 'sol expired', 'barred by statute']);

  const hasLatePaymentOnly = hasViolationType(violations, ['late payment', 'late pay', 'goodwill', 'isolated late', '30 day late', '60 day late', '90 day late'])
    && !status.includes('collection') && !status.includes('charge-off') && !status.includes('charge off')
    && !type.includes('collection') && !type.includes('debt');

  const hasTILA = hasViolationType(violations, ['tila', 'truth in lending', 'finance charge', 'annual percentage rate', 'apr violation', 'disclosure required']);

  if (isMedical && isCollection) {
    return {
      recommendedTemplate: 'hipaa-medical-debt',
      reason: 'Medical debt in collections — request HIPAA authorization and full itemized validation under FDCPA §809',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['debt-validation', 'cease-and-desist']
    };
  }

  if (hasHarassment && isCollection) {
    return {
      recommendedTemplate: 'fdcpa-harassment',
      reason: 'Harassment or abusive collection conduct detected — formally document and demand it stop under FDCPA §806',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['cease-and-desist', 'debt-validation']
    };
  }

  if (hasTimeBarred && isCollection) {
    return {
      recommendedTemplate: 'fdcpa-time-barred',
      reason: 'Debt appears to be past the statute of limitations — request proof the debt is still collectible under FDCPA',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['obsolete-debt', 'debt-validation']
    };
  }

  if (hasViolationType(violations, ['metro 2', 'metro2', 'compliance', 'inconsisten', 'field', 'segment', 'format'])) {
    return {
      recommendedTemplate: 'metro2-inconsistency-dispute',
      reason: 'Metro 2 compliance inconsistencies detected — dispute specific field-level violations and demand corrected data submission',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute']
    };
  }

  if (hasViolationType(violations, ['obsolete', 'expired', 'seven year', '7 year', 'time-barred', 'statute of limitation'])) {
    return {
      recommendedTemplate: 'obsolete-debt',
      reason: 'Debt appears obsolete or past the reporting period — request removal under FCRA §1681c',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute']
    };
  }

  if (status.includes('bankrupt') || type.includes('bankrupt') || hasViolationType(violations, ['bankrupt', 'discharge'])) {
    return {
      recommendedTemplate: 'bankruptcy-misreporting',
      reason: 'Bankruptcy-related item detected — dispute incorrect post-discharge reporting',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute']
    };
  }

  if (hasTILA && isLoan) {
    return {
      recommendedTemplate: 'tila-disclosure',
      reason: 'Loan account with disclosure violations — demand full TILA disclosure of rates, fees, and payment terms',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute']
    };
  }

  if (isCollection) {
    return {
      recommendedTemplate: 'debt-validation',
      reason: 'Collection account — request full debt validation under FDCPA §809 before proceeding',
      urgency: 'medium',
      letterTarget: 'collector',
      alternativeTemplates: ['611-general-dispute', 'cease-and-desist']
    };
  }

  if (hasViolationType(violations, ['reinsert', 're-insert', 'reappear', 'previously deleted'])) {
    return {
      recommendedTemplate: 'reinsertion-dispute',
      reason: 'Item appears to have been reinserted without proper notice — dispute under FCRA §611(a)(5)(B)',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute']
    };
  }

  if (hasLatePaymentOnly) {
    return {
      recommendedTemplate: 'goodwill-removal',
      reason: 'Late payment notation on otherwise current account — request goodwill removal from the creditor',
      urgency: 'low',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute']
    };
  }

  if (hasViolations) {
    return {
      recommendedTemplate: '611-general-dispute',
      reason: 'Inaccuracies detected — file a general dispute under FCRA §611 for investigation',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    };
  }

  return {
    recommendedTemplate: '611-general-dispute',
    reason: 'General dispute recommended — request investigation under FCRA §611',
    urgency: 'low',
    letterTarget: 'bureau',
    alternativeTemplates: ['609-disclosure']
  };
}

export function recommendNextLetter({ letterType = '', round = 1, outcome = '', violations = [], accountType = '', accountStatus = '' }) {
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
  const hasTimeBarred = hasViolationType(violations, ['time-barred', 'time barred', 'statute of limitation', 'sol expired', 'barred by statute']);
  const hasFactualErrors = hasViolationType(violations, ['factual', 'incorrect date', 'balance error', 'wrong date', 'incorrect balance', 'date error']);
  const hasGoodwillEligible = hasViolationType(violations, ['late payment', 'late pay', 'goodwill', 'isolated late', '30 day late', '60 day late'])
    && !status.includes('collection') && !status.includes('charge-off') && !status.includes('charge off')
    && !type.includes('collection') && !type.includes('debt');
  const prevIsPFD = prev.includes('pay-for-delete');

  if (result === 'removed' || result === 'deleted' || result === 'corrected') {
    return {
      recommendedTemplate: null,
      reason: 'Item has been removed or corrected — no further action needed',
      urgency: 'none',
      letterTarget: 'bureau',
      alternativeTemplates: []
    };
  }

  if (isMedical && isCollection) {
    return {
      recommendedTemplate: 'hipaa-medical-debt',
      reason: 'Medical collection account — request HIPAA authorization, itemized billing, and insurance verification under FDCPA §809',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['debt-validation', 'cease-and-desist']
    };
  }

  if (hasHarassment && isCollection) {
    return {
      recommendedTemplate: 'fdcpa-harassment',
      reason: 'Harassment or abusive conduct from collector — demand it stop immediately under FDCPA §806',
      urgency: 'high',
      letterTarget: 'collector',
      alternativeTemplates: ['cease-and-desist', 'debt-validation']
    };
  }

  if (result === 'awaiting' || result === 'awaiting_response') {
    if (hasTimeBarred && isCollection) {
      return {
        recommendedTemplate: 'fdcpa-time-barred',
        reason: 'Collection account still awaiting — debt may be time-barred; demand proof it is within the statute of limitations',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', 'obsolete-debt']
      };
    }
    if (isCollection) {
      const template = prev.includes('debt-validation') ? 'second-round-dispute' : 'debt-validation';
      return {
        recommendedTemplate: template,
        reason: !prev.includes('debt-validation')
          ? 'Collection account still awaiting — send debt validation request under FDCPA §809'
          : 'Collection account awaiting response — follow up with escalated dispute',
        urgency: 'medium',
        letterTarget: tgt(template),
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
      };
    }
    if (hasBankruptcy) {
      return {
        recommendedTemplate: 'bankruptcy-misreporting',
        reason: 'Bankruptcy-related item awaiting response — follow up on discharge reporting',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
      };
    }
    if (hasObsolete) {
      return {
        recommendedTemplate: 'obsolete-debt',
        reason: 'Obsolete debt awaiting response — reiterate removal request under FCRA §1681c',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
      };
    }
    if (hasMetro2Issues) {
      return {
        recommendedTemplate: 'metro2-inconsistency-dispute',
        reason: 'Metro 2 compliance issues still awaiting response — follow up demanding corrected data submission',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['second-round-dispute', 'method-of-verification']
      };
    }
    return {
      recommendedTemplate: 'second-round-dispute',
      reason: 'Item still awaiting response — send follow-up dispute demanding reinvestigation',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', 'method-of-verification']
    };
  }

  if (result === 'no_response' || result === 'no response') {
    if (prevIsPFD) {
      return {
        recommendedTemplate: 'pay-for-delete-followup',
        reason: 'No response to pay-for-delete offer — renew the settlement offer with a firm deadline',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', 'ag-cfpb-escalation']
      };
    }
    if (hasTimeBarred && isCollection) {
      return {
        recommendedTemplate: 'fdcpa-time-barred',
        reason: 'No response on collection account — debt may be time-barred; demand proof it is within statute of limitations',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', 'obsolete-debt']
      };
    }
    if (round >= 3) {
      if (hasMetro2Issues) {
        return {
          recommendedTemplate: 'metro2-deletion-demand',
          reason: 'No response after multiple rounds with Metro 2 violations — demand deletion under FCRA §607(b) and §611',
          urgency: 'high',
          letterTarget: 'bureau',
          alternativeTemplates: ['ag-cfpb-escalation', 'arbitration-election']
        };
      }
      return {
        recommendedTemplate: 'ag-cfpb-escalation',
        reason: 'No response after multiple rounds — escalate with AG/CFPB complaint threat',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['arbitration-election']
      };
    }
    if (isCollection) {
      if (round >= 2 && !prev.includes('pay-for-delete')) {
        return {
          recommendedTemplate: 'pay-for-delete',
          reason: 'No response from collector after multiple rounds — propose conditional pay-for-delete settlement at 40%',
          urgency: 'high',
          letterTarget: 'collector',
          alternativeTemplates: ['debt-validation', 'ag-cfpb-escalation']
        };
      }
      const template = prev.includes('debt-validation') ? 'second-round-dispute' : 'debt-validation';
      return {
        recommendedTemplate: template,
        reason: !prev.includes('debt-validation')
          ? 'No response on collection account — demand debt validation under FDCPA §809'
          : 'No response after debt validation — escalate with second-round dispute',
        urgency: 'high',
        letterTarget: tgt(template),
        alternativeTemplates: ['ag-cfpb-escalation', '623-direct-dispute']
      };
    }
    if (hasFactualErrors && round >= 2) {
      return {
        recommendedTemplate: 'factual-errors-layer',
        reason: 'No response despite documented factual errors — submit additional evidence and demand reopened investigation',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['second-round-dispute', 'method-of-verification']
      };
    }
    return {
      recommendedTemplate: 'second-round-dispute',
      reason: 'No response received — send escalation dispute demanding proper reinvestigation',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['ag-cfpb-escalation', 'method-of-verification']
    };
  }

  if (result === 'verified') {
    if (round >= 3) {
      if (hasMetro2Issues) {
        return {
          recommendedTemplate: 'metro2-deletion-demand',
          reason: 'Verified multiple times despite Metro 2 violations — demand deletion under FCRA §607(b) and §611',
          urgency: 'high',
          letterTarget: 'bureau',
          alternativeTemplates: ['ag-cfpb-escalation', 'arbitration-election']
        };
      }
      return {
        recommendedTemplate: 'ag-cfpb-escalation',
        reason: 'Item verified multiple times without adequate proof — escalate to regulators',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['arbitration-election', '623-direct-dispute']
      };
    }
    if (isCollection) {
      if (round >= 2 && !prevIsPFD) {
        return {
          recommendedTemplate: 'pay-for-delete',
          reason: 'Collection verified — propose conditional pay-for-delete settlement to resolve without ongoing credit damage',
          urgency: 'medium',
          letterTarget: 'collector',
          alternativeTemplates: ['623-direct-dispute', 'method-of-verification']
        };
      }
      return {
        recommendedTemplate: '623-direct-dispute',
        reason: 'Collection verified — dispute directly with furnisher under FCRA §623',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['method-of-verification', 'ag-cfpb-escalation']
      };
    }
    if (hasFactualErrors) {
      return {
        recommendedTemplate: 'factual-errors-layer',
        reason: 'Verified despite documented factual errors — submit evidence layer to force substantive re-examination',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['method-of-verification', '623-direct-dispute']
      };
    }
    if (hasMetro2Issues) {
      return {
        recommendedTemplate: 'method-of-verification',
        reason: 'Verified despite Metro 2 violations — demand method of verification under FCRA §611(a)(7)',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['metro2-inconsistency-dispute', 'ag-cfpb-escalation']
      };
    }
    return {
      recommendedTemplate: '609-disclosure',
      reason: 'Item verified without adequate proof — request full disclosure under FCRA §609',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    };
  }

  if (result === 'stalled') {
    if (round >= 3) {
      return {
        recommendedTemplate: 'arbitration-election',
        reason: 'Dispute stalled after multiple rounds — elect arbitration to force resolution',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['ag-cfpb-escalation']
      };
    }
    return {
      recommendedTemplate: '623-direct-dispute',
      reason: 'Dispute stalled — bypass bureaus and dispute directly with furnisher under FCRA §623',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['ag-cfpb-escalation', 'method-of-verification']
    };
  }

  if (result === 'partial') {
    if (hasGoodwillEligible) {
      return {
        recommendedTemplate: 'goodwill-removal',
        reason: 'Partial correction received on a late payment account — request goodwill removal of remaining notations',
        urgency: 'low',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'method-of-verification']
      };
    }
    if (isCollection) {
      return {
        recommendedTemplate: '623-direct-dispute',
        reason: 'Partial correction on collection — dispute directly with furnisher for remaining inaccuracies',
        urgency: 'medium',
        letterTarget: 'bureau',
        alternativeTemplates: ['611-general-dispute', 'method-of-verification']
      };
    }
    return {
      recommendedTemplate: '611-general-dispute',
      reason: 'Partial correction received — dispute remaining inaccuracies under FCRA §611',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['method-of-verification', '623-direct-dispute']
    };
  }

  if (result === 'updated') {
    return {
      recommendedTemplate: 'method-of-verification',
      reason: 'Item updated but may still be inaccurate — request method of verification under FCRA §611(a)(7)',
      urgency: 'medium',
      letterTarget: 'bureau',
      alternativeTemplates: ['611-general-dispute', '623-direct-dispute']
    };
  }

  if (round >= 3) {
    if (hasMetro2Issues) {
      return {
        recommendedTemplate: 'metro2-deletion-demand',
        reason: 'Multiple dispute rounds completed with ongoing Metro 2 violations — demand deletion under FCRA §607(b)',
        urgency: 'high',
        letterTarget: 'bureau',
        alternativeTemplates: ['ag-cfpb-escalation', 'arbitration-election']
      };
    }
    return {
      recommendedTemplate: 'ag-cfpb-escalation',
      reason: 'Multiple dispute rounds completed — escalate with regulatory complaint',
      urgency: 'high',
      letterTarget: 'bureau',
      alternativeTemplates: ['arbitration-election']
    };
  }

  if (isCollection) {
    if (hasTimeBarred) {
      return {
        recommendedTemplate: 'fdcpa-time-barred',
        reason: 'Collection account with potential statute of limitations issue — demand proof debt is within the collectible period',
        urgency: 'high',
        letterTarget: 'collector',
        alternativeTemplates: ['obsolete-debt', 'debt-validation']
      };
    }
    if (round >= 2 && !prevIsPFD) {
      return {
        recommendedTemplate: 'pay-for-delete',
        reason: 'Collection account persisting after initial dispute — propose conditional pay-for-delete settlement at 40%',
        urgency: 'medium',
        letterTarget: 'collector',
        alternativeTemplates: ['debt-validation', '623-direct-dispute']
      };
    }
    const template = prev.includes('debt-validation') ? '623-direct-dispute' : 'debt-validation';
    return {
      recommendedTemplate: template,
      reason: !prev.includes('debt-validation')
        ? 'Collection account — request debt validation under FDCPA §809'
        : 'Follow up on collection — dispute directly with furnisher under FCRA §623',
      urgency: 'medium',
      letterTarget: tgt(template),
      alternativeTemplates: ['611-general-dispute', 'second-round-dispute']
    };
  }

  return {
    recommendedTemplate: 'second-round-dispute',
    reason: 'Follow-up dispute recommended — escalate with reinvestigation demand',
    urgency: 'medium',
    letterTarget: 'bureau',
    alternativeTemplates: ['method-of-verification', '623-direct-dispute']
  };
}
