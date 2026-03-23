// stateLaws.js — State consumer-protection law addenda for dispute letters
// Tone: informational only — no statute citations as threats, no guarantees

const STATE_LAW_ADDENDA = {
  CA: {
    name: 'California',
    addendum: 'Additionally, as a California resident, you may have rights under the California Consumer Credit Reporting Agencies Act and the California Consumer Privacy Act. You have the right to obtain a free copy of your credit report and to dispute inaccurate information. If a consumer credit reporting agency fails to properly investigate your dispute, you may have the right to seek correction through California state channels.',
  },
  TX: {
    name: 'Texas',
    addendum: 'Additionally, as a Texas resident, you may have rights under the Texas Business & Commerce Code related to credit reporting. Texas law provides certain protections regarding the accuracy of information furnished to and reported by consumer credit reporting agencies. You may also contact the Texas Office of Consumer Credit Commissioner for guidance on your rights.',
  },
  NY: {
    name: 'New York',
    addendum: 'Additionally, as a New York resident, you may have rights under the New York Fair Credit Reporting Act, which provides consumer protections that may exceed federal law in certain respects. New York residents can also contact the New York State Department of Financial Services for assistance with credit reporting concerns.',
  },
  MD: {
    name: 'Maryland',
    addendum: 'Additionally, as a Maryland resident, you may have rights under the Maryland Consumer Debt Collection Act and Maryland credit reporting statutes. Maryland law provides additional consumer protections regarding the accuracy of credit information. You may also contact the Maryland Office of the Attorney General, Consumer Protection Division, for guidance.',
  },
  MA: {
    name: 'Massachusetts',
    addendum: 'Additionally, as a Massachusetts resident, you may have rights under Chapter 93 of the Massachusetts General Laws, which governs consumer credit reporting. Massachusetts law provides additional protections that may apply to your dispute. You may also contact the Massachusetts Office of Consumer Affairs and Business Regulation for guidance.',
  },
  CO: {
    name: 'Colorado',
    addendum: 'Additionally, as a Colorado resident, you may have rights under the Colorado Consumer Protection Act and Colorado credit reporting laws. Colorado residents have the right to place a security freeze on their credit file free of charge. You may also contact the Colorado Attorney General\'s Office for guidance on your consumer rights.',
  },
  NJ: {
    name: 'New Jersey',
    addendum: 'Additionally, as a New Jersey resident, you may have rights under New Jersey\'s consumer protection statutes, including the New Jersey Consumer Fraud Act. New Jersey law provides certain protections in connection with the reporting of consumer credit information. You may also contact the New Jersey Division of Consumer Affairs for guidance.',
  },
  CT: {
    name: 'Connecticut',
    addendum: 'Additionally, as a Connecticut resident, you may have rights under the Connecticut Fair Credit Reporting Act and the Connecticut Unfair Trade Practices Act. Connecticut law may provide protections beyond federal law regarding the accuracy of your credit file. You may also contact the Connecticut Department of Banking for guidance.',
  },
  IL: {
    name: 'Illinois',
    addendum: 'Additionally, as an Illinois resident, you may have rights under the Illinois Consumer Fraud and Deceptive Business Practices Act and Illinois credit reporting statutes. Illinois law provides certain consumer protections that may be relevant to your dispute. You may also contact the Illinois Attorney General\'s Office for guidance on your rights.',
  },
  WA: {
    name: 'Washington',
    addendum: 'Additionally, as a Washington State resident, you may have rights under the Washington Consumer Protection Act and Washington credit reporting statutes. Washington law provides certain consumer protections in connection with the accuracy of credit information. You may also contact the Washington State Office of the Attorney General for guidance.',
  },
  GA: {
    name: 'Georgia',
    addendum: 'Additionally, as a Georgia resident, you may have rights under the Georgia Fair Business Practices Act and related credit reporting statutes. Georgia law provides certain consumer protections regarding the accuracy of credit reporting. You may also contact the Georgia Consumer Protection Division of the Attorney General\'s Office for guidance.',
  },
  FL: {
    name: 'Florida',
    addendum: 'Additionally, as a Florida resident, you may have rights under the Florida Consumer Collection Practices Act and Florida credit reporting statutes. Florida law provides certain protections regarding the accuracy of consumer credit information. You may also contact the Florida Attorney General\'s Office or the Florida Department of Financial Services for guidance.',
  },
  OR: {
    name: 'Oregon',
    addendum: 'Additionally, as an Oregon resident, you may have rights under the Oregon Unlawful Debt Collection Practices Act and Oregon credit reporting statutes. Oregon law provides certain consumer protections that may apply to your dispute. You may also contact the Oregon Department of Justice for guidance on your rights.',
  },
  MN: {
    name: 'Minnesota',
    addendum: 'Additionally, as a Minnesota resident, you may have rights under the Minnesota Unfair Trade Practices Act and Minnesota credit reporting statutes. Minnesota law provides certain consumer protections in connection with the accuracy of credit information. You may also contact the Minnesota Department of Commerce for guidance.',
  },
  MI: {
    name: 'Michigan',
    addendum: 'Additionally, as a Michigan resident, you may have rights under the Michigan Collection Practices Act and Michigan credit reporting statutes. Michigan law provides certain consumer protections regarding the accuracy of credit reporting. You may also contact the Michigan Department of Attorney General for guidance on your rights.',
  },
  PA: {
    name: 'Pennsylvania',
    addendum: 'Additionally, as a Pennsylvania resident, you may have rights under the Pennsylvania Fair Credit Extension Uniformity Act and related consumer protection statutes. Pennsylvania law provides certain protections in connection with the accuracy of consumer credit information. You may also contact the Pennsylvania Bureau of Consumer Protection for guidance.',
  },
  OH: {
    name: 'Ohio',
    addendum: 'Additionally, as an Ohio resident, you may have rights under the Ohio Consumer Sales Practices Act and Ohio credit reporting statutes. Ohio law provides certain consumer protections regarding the accuracy of credit information. You may also contact the Ohio Attorney General\'s Consumer Protection Section for guidance.',
  },
  VA: {
    name: 'Virginia',
    addendum: 'Additionally, as a Virginia resident, you may have rights under the Virginia Consumer Protection Act and the Virginia Consumer Data Protection Act. Virginia law provides certain protections that may apply to your credit dispute. You may also contact the Virginia Office of the Attorney General for guidance on your rights.',
  },
  NC: {
    name: 'North Carolina',
    addendum: 'Additionally, as a North Carolina resident, you may have rights under the North Carolina Debt Collection Act and North Carolina consumer protection statutes. North Carolina law provides certain consumer protections in connection with the accuracy of credit reporting. You may also contact the North Carolina Attorney General\'s Consumer Protection Division for guidance.',
  },
  AZ: {
    name: 'Arizona',
    addendum: 'Additionally, as an Arizona resident, you may have rights under the Arizona Consumer Fraud Act and related credit reporting statutes. Arizona law provides certain consumer protections regarding the accuracy of credit information. You may also contact the Arizona Attorney General\'s Office for guidance on your rights.',
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
