// stateLaws.js — State consumer-protection law addenda for dispute letters
// Tone: notice to the recipient (bureau/creditor) about the consumer's state rights

const STATE_LAW_ADDENDA = {
  CA: {
    name: 'California',
    addendum: 'Please be advised that this consumer is also protected under the California Consumer Credit Reporting Agencies Act (CCRAA) and the California Consumer Privacy Act. California law imposes obligations on credit reporting agencies and furnishers that are in addition to — and in some respects more stringent than — federal FCRA requirements. Failure to comply with applicable state law may expose your organization to remedies available under California law.',
  },
  TX: {
    name: 'Texas',
    addendum: 'Please be advised that this consumer is also protected under the Texas Business & Commerce Code and applicable Texas credit reporting statutes. Texas law imposes obligations on credit reporting agencies and furnishers regarding the accuracy and investigation of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Texas law, including those enforceable by the Texas Office of Consumer Credit Commissioner.',
  },
  NY: {
    name: 'New York',
    addendum: 'Please be advised that this consumer is also protected under the New York Fair Credit Reporting Act, which provides consumer rights that may exceed those under federal law. New York law imposes additional obligations on credit reporting agencies in connection with dispute investigations and the accuracy of reported information. Failure to comply with applicable state law may expose your organization to remedies available under New York law and through the New York State Department of Financial Services.',
  },
  MD: {
    name: 'Maryland',
    addendum: 'Please be advised that this consumer is also protected under the Maryland Consumer Debt Collection Act and Maryland credit reporting statutes. Maryland law imposes additional obligations on credit reporting agencies and debt collectors regarding the accuracy and investigation of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Maryland law, including those enforceable by the Maryland Office of the Attorney General, Consumer Protection Division.',
  },
  MA: {
    name: 'Massachusetts',
    addendum: 'Please be advised that this consumer is also protected under Chapter 93 of the Massachusetts General Laws governing consumer credit reporting. Massachusetts law imposes additional obligations on credit reporting agencies and furnishers regarding the accuracy and investigation of disputed information. Failure to comply with applicable state law may expose your organization to remedies available under Massachusetts law, including those enforceable by the Massachusetts Office of Consumer Affairs and Business Regulation.',
  },
  CO: {
    name: 'Colorado',
    addendum: 'Please be advised that this consumer is also protected under the Colorado Consumer Protection Act and applicable Colorado credit reporting statutes. Colorado law imposes obligations on credit reporting agencies and furnishers that are in addition to federal requirements. Failure to comply with applicable state law may expose your organization to remedies available under Colorado law, including those enforceable by the Colorado Attorney General\'s Office.',
  },
  NJ: {
    name: 'New Jersey',
    addendum: 'Please be advised that this consumer is also protected under the New Jersey Consumer Fraud Act and applicable New Jersey consumer protection statutes, including provisions governing the accuracy of consumer credit reporting. Failure to comply with applicable state law may expose your organization to remedies available under New Jersey law, including those enforceable by the New Jersey Division of Consumer Affairs.',
  },
  CT: {
    name: 'Connecticut',
    addendum: 'Please be advised that this consumer is also protected under the Connecticut Fair Credit Reporting Act and the Connecticut Unfair Trade Practices Act. Connecticut law imposes obligations on credit reporting agencies and furnishers that may exceed federal standards in certain respects. Failure to comply with applicable state law may expose your organization to remedies available under Connecticut law, including those enforceable by the Connecticut Department of Banking.',
  },
  IL: {
    name: 'Illinois',
    addendum: 'Please be advised that this consumer is also protected under the Illinois Consumer Fraud and Deceptive Business Practices Act and applicable Illinois credit reporting statutes. Illinois law imposes obligations on credit reporting agencies and furnishers regarding the accuracy of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Illinois law, including those enforceable by the Illinois Attorney General\'s Office.',
  },
  WA: {
    name: 'Washington',
    addendum: 'Please be advised that this consumer is also protected under the Washington Consumer Protection Act and applicable Washington credit reporting statutes. Washington law imposes obligations on credit reporting agencies and furnishers regarding the accuracy and investigation of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Washington law, including those enforceable by the Washington State Office of the Attorney General.',
  },
  GA: {
    name: 'Georgia',
    addendum: 'Please be advised that this consumer is also protected under the Georgia Fair Business Practices Act and related Georgia credit reporting statutes. Georgia law imposes obligations on credit reporting agencies and furnishers regarding the accuracy of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Georgia law, including those enforceable by the Georgia Consumer Protection Division of the Attorney General\'s Office.',
  },
  FL: {
    name: 'Florida',
    addendum: 'Please be advised that this consumer is also protected under the Florida Consumer Collection Practices Act and applicable Florida credit reporting statutes. Florida law imposes obligations on credit reporting agencies and debt collectors regarding the accuracy and collection of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Florida law, including those enforceable by the Florida Attorney General\'s Office and the Florida Department of Financial Services.',
  },
  OR: {
    name: 'Oregon',
    addendum: 'Please be advised that this consumer is also protected under the Oregon Unlawful Debt Collection Practices Act and applicable Oregon credit reporting statutes. Oregon law imposes obligations on credit reporting agencies and debt collectors regarding the accuracy and investigation of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Oregon law, including those enforceable by the Oregon Department of Justice.',
  },
  MN: {
    name: 'Minnesota',
    addendum: 'Please be advised that this consumer is also protected under the Minnesota Unfair Trade Practices Act and applicable Minnesota credit reporting statutes. Minnesota law imposes obligations on credit reporting agencies and furnishers regarding the accuracy of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Minnesota law, including those enforceable by the Minnesota Department of Commerce.',
  },
  MI: {
    name: 'Michigan',
    addendum: 'Please be advised that this consumer is also protected under the Michigan Collection Practices Act and applicable Michigan credit reporting statutes. Michigan law imposes obligations on credit reporting agencies and debt collectors regarding the accuracy and investigation of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Michigan law, including those enforceable by the Michigan Department of Attorney General.',
  },
  PA: {
    name: 'Pennsylvania',
    addendum: 'Please be advised that this consumer is also protected under the Pennsylvania Fair Credit Extension Uniformity Act and related Pennsylvania consumer protection statutes. Pennsylvania law imposes obligations on credit reporting agencies and furnishers regarding the accuracy of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Pennsylvania law, including those enforceable by the Pennsylvania Bureau of Consumer Protection.',
  },
  OH: {
    name: 'Ohio',
    addendum: 'Please be advised that this consumer is also protected under the Ohio Consumer Sales Practices Act and applicable Ohio credit reporting statutes. Ohio law imposes obligations on credit reporting agencies and furnishers regarding the accuracy of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Ohio law, including those enforceable by the Ohio Attorney General\'s Consumer Protection Section.',
  },
  VA: {
    name: 'Virginia',
    addendum: 'Please be advised that this consumer is also protected under the Virginia Consumer Protection Act and the Virginia Consumer Data Protection Act. Virginia law imposes obligations on credit reporting agencies and furnishers regarding the accuracy of consumer credit information and the handling of personal data. Failure to comply with applicable state law may expose your organization to remedies available under Virginia law, including those enforceable by the Virginia Office of the Attorney General.',
  },
  NC: {
    name: 'North Carolina',
    addendum: 'Please be advised that this consumer is also protected under the North Carolina Debt Collection Act and applicable North Carolina consumer protection statutes. North Carolina law imposes obligations on credit reporting agencies and debt collectors regarding the accuracy of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under North Carolina law, including those enforceable by the North Carolina Attorney General\'s Consumer Protection Division.',
  },
  AZ: {
    name: 'Arizona',
    addendum: 'Please be advised that this consumer is also protected under the Arizona Consumer Fraud Act and applicable Arizona credit reporting statutes. Arizona law imposes obligations on credit reporting agencies and furnishers regarding the accuracy of consumer credit information. Failure to comply with applicable state law may expose your organization to remedies available under Arizona law, including those enforceable by the Arizona Attorney General\'s Office.',
  },
};

/**
 * Returns the state-specific addendum paragraph for a given state code or name.
 * Returns null if no addendum exists for the state.
 * @param {string} stateRaw - State code (e.g. "CA") or name (e.g. "California")
 * @returns {{ name: string, addendum: string } | null}
 */
export function getStateLawAddendum(stateRaw) {
  if (!stateRaw) return null;
  const upper = String(stateRaw).trim().toUpperCase();
  if (STATE_LAW_ADDENDA[upper]) return STATE_LAW_ADDENDA[upper];
  const nameEntry = Object.values(STATE_LAW_ADDENDA).find(
    (v) => v.name.toUpperCase() === upper
  );
  return nameEntry || null;
}

export { STATE_LAW_ADDENDA };
