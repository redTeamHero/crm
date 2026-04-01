const BUILT_IN_COLLECTORS = [
  { name: 'Portfolio Recovery Associates', addr1: '120 Corporate Blvd, Ste 1', city: 'Norfolk', state: 'VA', zip: '23502' },
  { name: 'LVNV Funding', addr1: 'PO Box 10587', city: 'Greenville', state: 'SC', zip: '29603' },
  { name: 'Resurgent Capital Services', addr1: 'PO Box 10587', city: 'Greenville', state: 'SC', zip: '29603' },
  { name: 'Midland Credit Management', addr1: '350 Camino De La Reina, Ste 100', city: 'San Diego', state: 'CA', zip: '92108' },
  { name: 'Midland Funding', addr1: '350 Camino De La Reina, Ste 100', city: 'San Diego', state: 'CA', zip: '92108' },
  { name: 'Encore Capital Group', addr1: '350 Camino De La Reina, Ste 300', city: 'San Diego', state: 'CA', zip: '92108' },
  { name: 'Jefferson Capital Systems', addr1: '16 McLeland Rd', city: 'St Cloud', state: 'MN', zip: '56303' },
  { name: 'IC System', addr1: '444 Highway 96 East', city: 'St Paul', state: 'MN', zip: '55127' },
  { name: 'Convergent Outsourcing', addr1: '800 SW 39th St', city: 'Renton', state: 'WA', zip: '98057' },
  { name: 'Transworld Systems', addr1: '507 Prudential Rd', city: 'Horsham', state: 'PA', zip: '19044' },
  { name: 'Allied Interstate', addr1: 'PO Box 4000', city: 'Warrenton', state: 'VA', zip: '20188' },
  { name: 'National Credit Systems', addr1: 'PO Box 312125', city: 'Atlanta', state: 'GA', zip: '31131' },
  { name: 'ARS National Services', addr1: 'PO Box 469100', city: 'Escondido', state: 'CA', zip: '92046' },
  { name: 'Radius Global Solutions', addr1: 'PO Box 390905', city: 'Minneapolis', state: 'MN', zip: '55439' },
  { name: 'Healthcare Revenue Recovery Group', addr1: 'PO Box 6040', city: 'Coppell', state: 'TX', zip: '75019' },
  { name: 'HRRG', addr1: 'PO Box 6040', city: 'Coppell', state: 'TX', zip: '75019' },
  { name: 'Genesis Financial Solutions', addr1: 'PO Box 4477', city: 'Beaverton', state: 'OR', zip: '97076' },
  { name: 'Credit Corp Solutions', addr1: '4 West Red Oak Ln', city: 'White Plains', state: 'NY', zip: '10604' },
  { name: 'Enhanced Recovery Company', addr1: '8014 Bayberry Rd', city: 'Jacksonville', state: 'FL', zip: '32256' },
  { name: 'ERC', addr1: '8014 Bayberry Rd', city: 'Jacksonville', state: 'FL', zip: '32256' },
  { name: 'FirstSource Advantage', addr1: 'PO Box 628', city: 'Buffalo', state: 'NY', zip: '14240' },
  { name: 'AllianceOne Receivables Management', addr1: 'PO Box 3100', city: 'Southeastern', state: 'PA', zip: '19398' },
  { name: 'State Collection Service', addr1: '2509 S Stoughton Rd', city: 'Madison', state: 'WI', zip: '53716' },
  { name: 'FMA Alliance', addr1: 'PO Box 2017', city: 'Houston', state: 'TX', zip: '77252' },
  { name: 'Absolute Resolutions', addr1: '1 Absolute Way', city: 'Minnetonka', state: 'MN', zip: '55305' },
  { name: 'Crown Asset Management', addr1: '3100 Medlock Bridge Rd, Ste 250', city: 'Norcross', state: 'GA', zip: '30071' },
  { name: 'Commonwealth Financial Systems', addr1: '245 Main St', city: 'Dickson City', state: 'PA', zip: '18519' },
  { name: 'CCS Credit Collection Services', addr1: '725 Canton St', city: 'Norwood', state: 'MA', zip: '02062' },
  { name: 'Cain & Weiner', addr1: '21 Melville Park Rd', city: 'Melville', state: 'NY', zip: '11747' },
  { name: 'Northland Group', addr1: 'PO Box 390846', city: 'Edina', state: 'MN', zip: '55439' },
  { name: 'Diversified Consultants', addr1: '10550 Deerwood Park Blvd', city: 'Jacksonville', state: 'FL', zip: '32256' },
  { name: 'United Collection Bureau', addr1: '5620 Southwyck Blvd', city: 'Toledo', state: 'OH', zip: '43614' },
  { name: 'UCB', addr1: '5620 Southwyck Blvd', city: 'Toledo', state: 'OH', zip: '43614' },
  { name: 'Global Credit & Collection Corp', addr1: 'PO Box 11852', city: 'Wilmington', state: 'DE', zip: '19850' },
  { name: 'Afni Inc', addr1: 'PO Box 3517', city: 'Bloomington', state: 'IL', zip: '61702' },
  { name: 'Hunter Warfield', addr1: '4620 Woodland Corporate Blvd', city: 'Tampa', state: 'FL', zip: '33614' },
  { name: 'ConServe', addr1: '200 CrossKeys Office Park', city: 'Fairport', state: 'NY', zip: '14450' },
  { name: 'Credence Resource Management', addr1: 'PO Box 2300', city: 'Southgate', state: 'MI', zip: '48195' },
  { name: 'Receivables Performance Management', addr1: 'PO Box 1548', city: 'Lynnwood', state: 'WA', zip: '98046' },
  { name: 'MRS BPO', addr1: '1930 Olney Ave', city: 'Cherry Hill', state: 'NJ', zip: '08003' },
  { name: 'Frontline Asset Strategies', addr1: 'PO Box 26', city: 'Albertville', state: 'MN', zip: '55301' },
  { name: 'National Action Financial Services', addr1: 'PO Box 9023', city: 'Williamsville', state: 'NY', zip: '14231' },
  { name: 'Central Business Collections Service', addr1: 'PO Box 163250', city: 'Columbus', state: 'OH', zip: '43216' },
  { name: 'CBCS', addr1: 'PO Box 163250', city: 'Columbus', state: 'OH', zip: '43216' },
  { name: 'Performant Recovery', addr1: '333 N Canyons Pkwy, Ste 100', city: 'Livermore', state: 'CA', zip: '94551' },
  { name: 'Capital One Collections', addr1: 'PO Box 30285', city: 'Salt Lake City', state: 'UT', zip: '84130' },
  { name: 'Capital One', addr1: 'PO Box 30285', city: 'Salt Lake City', state: 'UT', zip: '84130' },
  { name: 'Synchrony Bank', addr1: 'PO Box 965064', city: 'Orlando', state: 'FL', zip: '32896' },
  { name: 'Comenity Bank', addr1: 'PO Box 182273', city: 'Columbus', state: 'OH', zip: '43218' },
  { name: 'Discover Financial', addr1: 'PO Box 15316', city: 'Wilmington', state: 'DE', zip: '19850' },
  { name: 'Discover Collections', addr1: 'PO Box 15316', city: 'Wilmington', state: 'DE', zip: '19850' },
  { name: 'Navient Solutions', addr1: 'PO Box 9640', city: 'Wilkes-Barre', state: 'PA', zip: '18773' },
  { name: 'Sallie Mae', addr1: 'PO Box 6180', city: 'Indianapolis', state: 'IN', zip: '46206' },
  { name: 'PayPal', addr1: 'PO Box 45950', city: 'Omaha', state: 'NE', zip: '68145' },
  { name: 'World Acceptance Corporation', addr1: '108 Fredrick Rd', city: 'Greenville', state: 'SC', zip: '29607' },
  { name: 'Regional Management Corp', addr1: '979 Batesville Rd', city: 'Greer', state: 'SC', zip: '29651' },
  { name: 'Avant', addr1: '222 N LaSalle St, Ste 1700', city: 'Chicago', state: 'IL', zip: '60601' },
  { name: 'LendingClub', addr1: '71 Stevenson St, Ste 1000', city: 'San Francisco', state: 'CA', zip: '94105' },
  { name: 'SoFi', addr1: '2750 E Cottonwood Pkwy, Ste 300', city: 'Salt Lake City', state: 'UT', zip: '84121' },
  { name: 'Prosper Funding', addr1: '221 Main St, 3rd Fl', city: 'San Francisco', state: 'CA', zip: '94105' },
  { name: 'Oportun', addr1: '2 Circle Star Way', city: 'San Carlos', state: 'CA', zip: '94070' },
  { name: 'OneMain Financial', addr1: 'PO Box 1010', city: 'Evansville', state: 'IN', zip: '47706' },
  { name: 'AT&T', addr1: 'PO Box 5014', city: 'Carol Stream', state: 'IL', zip: '60197' },
  { name: 'Verizon', addr1: 'PO Box 15124', city: 'Albany', state: 'NY', zip: '12212' },
  { name: 'Comcast', addr1: 'PO Box 3001', city: 'Southeastern', state: 'PA', zip: '19398' },
  { name: 'T-Mobile', addr1: 'PO Box 53410', city: 'Bellevue', state: 'WA', zip: '98015' },
  { name: 'Sprint', addr1: 'PO Box 219554', city: 'Kansas City', state: 'MO', zip: '64121' },
  { name: 'Credit One Bank', addr1: 'PO Box 98873', city: 'Las Vegas', state: 'NV', zip: '89193' },
  { name: 'Marlin Finance', addr1: '300 Fellowship Rd', city: 'Mount Laurel', state: 'NJ', zip: '08054' },
  { name: 'Account Control Technology', addr1: '6918 Professional Center Dr', city: 'Louisville', state: 'KY', zip: '40219' },
  { name: 'ACT', addr1: '6918 Professional Center Dr', city: 'Louisville', state: 'KY', zip: '40219' },
  { name: 'Unifin', addr1: 'PO Box 26085', city: 'Dearborn', state: 'MI', zip: '48126' },
  { name: 'Collection Bureau of America', addr1: 'PO Box 5013', city: 'Hayward', state: 'CA', zip: '94540' },
  { name: 'Asset Acceptance', addr1: '28405 Van Dyke Ave', city: 'Warren', state: 'MI', zip: '48093' },
  { name: 'National Recovery Solutions', addr1: 'PO Box 350', city: 'Pennington', state: 'NJ', zip: '08534' },
  { name: 'WebBank', addr1: '215 South State St', city: 'Salt Lake City', state: 'UT', zip: '84111' },
];

function normalize(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMatch(query, entry) {
  const q = normalize(query);
  const n = normalize(entry.name);
  if (n === q) return 100;
  if (n.startsWith(q) || q.startsWith(n)) return 90;
  if (n.includes(q) || q.includes(n)) return 75;
  const qWords = q.split(' ').filter(w => w.length > 2);
  const nWords = n.split(' ').filter(w => w.length > 2);
  const matches = qWords.filter(w => nWords.some(nw => nw.includes(w) || w.includes(nw)));
  if (matches.length === 0) return 0;
  return Math.round((matches.length / Math.max(qWords.length, 1)) * 60);
}

function _bestMatch(name, entries, threshold = 50) {
  let best = null;
  let bestScore = 0;
  for (const entry of entries) {
    const score = scoreMatch(name, entry);
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return bestScore >= threshold ? best : null;
}

export function lookupCollectorAddress(name, customEntries = []) {
  if (!name) return null;
  const builtInMatch = _bestMatch(name, BUILT_IN_COLLECTORS);
  if (builtInMatch) return builtInMatch;
  if (customEntries.length) return _bestMatch(name, customEntries);
  return null;
}

export function getBuiltInCollectors() {
  return BUILT_IN_COLLECTORS.map(e => ({ ...e, builtIn: true }));
}
