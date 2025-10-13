export const PRICE_BUCKETS = [
  { id: '0-150', label: '0–150', min: 0, max: 150 },
  { id: '151-300', label: '151–300', min: 151, max: 300 },
  { id: '301-500', label: '301–500', min: 301, max: 500 },
  { id: '501+', label: '501+', min: 501, max: Number.POSITIVE_INFINITY },
];

const bucketIndex = new Map(PRICE_BUCKETS.map((bucket) => [bucket.id, bucket]));

export function resolveBucketId(price) {
  if (!Number.isFinite(price)) return null;
  for (const bucket of PRICE_BUCKETS) {
    if (price >= bucket.min && price <= bucket.max) {
      return bucket.id;
    }
  }
  return null;
}

export function getBucketMeta(id) {
  return bucketIndex.get(id) || null;
}

export function groupTradelinesByPrice(tradelines = []) {
  const grouped = {};
  for (const bucket of PRICE_BUCKETS) {
    grouped[bucket.id] = [];
  }
  for (const item of Array.isArray(tradelines) ? tradelines : []) {
    const bucketId = resolveBucketId(item?.price);
    if (!bucketId) continue;
    grouped[bucketId].push(item);
  }
  for (const bucket of PRICE_BUCKETS) {
    grouped[bucket.id].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  }
  return grouped;
}

export function buildRangeSummary(grouped) {
  const summary = [];
  for (const bucket of PRICE_BUCKETS) {
    const items = grouped?.[bucket.id] || [];
    summary.push({
      id: bucket.id,
      label: bucket.label,
      min: bucket.min,
      max: bucket.max,
      count: items.length,
    });
  }
  return summary;
}

export function listBanks(items = []) {
  const counts = new Map();
  for (const item of items) {
    const bank = (item?.bank || '').trim();
    if (!bank) continue;
    counts.set(bank, (counts.get(bank) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([bank, count]) => ({ bank, count }))
    .sort((a, b) => a.bank.localeCompare(b.bank));
}

const MONTH_INDEX = new Map([
  ['january', 1],
  ['jan', 1],
  ['february', 2],
  ['feb', 2],
  ['march', 3],
  ['mar', 3],
  ['april', 4],
  ['apr', 4],
  ['may', 5],
  ['june', 6],
  ['jun', 6],
  ['july', 7],
  ['jul', 7],
  ['august', 8],
  ['aug', 8],
  ['september', 9],
  ['sep', 9],
  ['sept', 9],
  ['october', 10],
  ['oct', 10],
  ['november', 11],
  ['nov', 11],
  ['december', 12],
  ['dec', 12],
]);

const STATEMENT_KEYWORDS = [
  { test: /weekly|daily|rolling|24\/7|anytime/i, weight: 1 },
  { test: /biweekly|twice/i, weight: 2 },
];

function buildStatementSortKey(label) {
  const text = (label || '').toString().trim();
  if (!text) {
    return { weight: 10, month: 13, day: 32, label: '' };
  }

  const keyword = STATEMENT_KEYWORDS.find((entry) => entry.test.test(text));
  if (keyword) {
    return { weight: keyword.weight, month: 13, day: 32, label: text.toLowerCase() };
  }

  const monthMatch = /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i.exec(
    text
  );
  const month = monthMatch ? MONTH_INDEX.get(monthMatch[1].toLowerCase()) ?? 13 : 13;

  const dayMatch = /(\d{1,2})(?:st|nd|rd|th)?/i.exec(text);
  const day = dayMatch ? Number.parseInt(dayMatch[1], 10) : 32;

  return {
    weight: month <= 12 ? 0 : 5,
    month,
    day,
    label: text.toLowerCase(),
  };
}

export function listStatementWindows(items = []) {
  const counts = new Map();
  for (const item of items) {
    const raw = (item?.statement_date || '').toString().trim();
    if (!raw) continue;
    const label = raw.replace(/\s+/g, ' ');
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      sortKey: buildStatementSortKey(label),
    }))
    .sort((a, b) => {
      if (a.sortKey.weight !== b.sortKey.weight) {
        return a.sortKey.weight - b.sortKey.weight;
      }
      if (a.sortKey.month !== b.sortKey.month) {
        return a.sortKey.month - b.sortKey.month;
      }
      if (a.sortKey.day !== b.sortKey.day) {
        return a.sortKey.day - b.sortKey.day;
      }
      return a.sortKey.label.localeCompare(b.sortKey.label);
    })
    .map(({ label, count }) => ({ label, count }));
}

export function paginate(items = [], page = 1, perPage = 20) {
  const safePerPage = Math.max(1, Math.min(Number.isFinite(perPage) ? perPage : 20, 100));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePerPage));
  const currentPage = Math.min(Math.max(Number.isFinite(page) ? page : 1, 1), totalPages);
  const start = (currentPage - 1) * safePerPage;
  const end = start + safePerPage;
  const slice = items.slice(start, end);
  return { items: slice, page: currentPage, perPage: safePerPage, totalItems, totalPages };
}

