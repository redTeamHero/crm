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

export function paginate(items = [], page = 1, perPage = 20, options = {}) {
  const resolvedMax = options?.maxPerPage;
  let maxPerPage;
  if (resolvedMax === undefined) {
    maxPerPage = 100;
  } else if (!Number.isFinite(resolvedMax)) {
    maxPerPage = Number.POSITIVE_INFINITY;
  } else {
    maxPerPage = Math.max(1, resolvedMax);
  }
  const basePerPage = Number.isFinite(perPage) ? perPage : 20;
  const safePerPage = Math.max(1, Math.min(basePerPage, maxPerPage));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePerPage));
  const currentPage = Math.min(Math.max(Number.isFinite(page) ? page : 1, 1), totalPages);
  const start = (currentPage - 1) * safePerPage;
  const end = start + safePerPage;
  const slice = items.slice(start, end);
  return { items: slice, page: currentPage, perPage: safePerPage, totalItems, totalPages };
}

