/* public/state-utils.js */

export const STATE_NAME_BY_CODE = Object.freeze({
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
  PR: 'Puerto Rico',
  AS: 'American Samoa',
  GU: 'Guam',
  MP: 'Northern Mariana Islands',
  VI: 'U.S. Virgin Islands'
});

export const STATE_CODE_BY_NAME = Object.freeze(
  Object.entries(STATE_NAME_BY_CODE).reduce((acc, [code, name]) => {
    acc[name.toUpperCase()] = code;
    return acc;
  }, {})
);

function sanitizeStateKey(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

const SANITIZED_STATE_INDEX = new Map();

function addSanitizedKey(key, code) {
  const sanitized = sanitizeStateKey(key);
  if (sanitized && !SANITIZED_STATE_INDEX.has(sanitized)) {
    SANITIZED_STATE_INDEX.set(sanitized, code);
  }
}

for (const [code, name] of Object.entries(STATE_NAME_BY_CODE)) {
  addSanitizedKey(code, code);
  addSanitizedKey(name, code);
  const words = name.toUpperCase().split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) {
    const alias = sanitizeStateKey(words[0][0] + words.slice(1).join(''));
    if (alias) {
      addSanitizedKey(alias, code);
    }
  }
}

const MANUAL_STATE_ALIASES = {
  WASHINGTONDC: 'DC',
  DISTRICTCOLUMBIA: 'DC',
  COMMONWEALTHOFPUERTORICO: 'PR',
  USVIRGINISLANDS: 'VI',
  VIRGINISLANDS: 'VI',
  USVI: 'VI',
  UNITEDSTATESVIRGINISLANDS: 'VI',
  NMARIANAISLANDS: 'MP',
  MARIANAISLANDS: 'MP',
  NORTHERNMARIANAS: 'MP',
  GUAMUSA: 'GU',
  NORTHERNMARIANAISLANDS: 'MP'
};

for (const [alias, code] of Object.entries(MANUAL_STATE_ALIASES)) {
  addSanitizedKey(alias, code);
}

export function toTitleCase(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, (_match, chr) => chr.toUpperCase());
}

export function resolveStateInfo(raw) {
  if (raw === null || raw === undefined) {
    return { code: null, name: null };
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return { code: null, name: null };
  }
  const upper = trimmed.toUpperCase();
  if (STATE_NAME_BY_CODE[upper]) {
    return { code: upper, name: STATE_NAME_BY_CODE[upper] };
  }
  if (STATE_CODE_BY_NAME[upper]) {
    const code = STATE_CODE_BY_NAME[upper];
    return { code, name: STATE_NAME_BY_CODE[code] };
  }
  const sanitized = sanitizeStateKey(upper);
  if (sanitized) {
    const canonical = SANITIZED_STATE_INDEX.get(sanitized);
    if (canonical && STATE_NAME_BY_CODE[canonical]) {
      return { code: canonical, name: STATE_NAME_BY_CODE[canonical] };
    }
  }
  return { code: null, name: toTitleCase(trimmed) };
}
