export function formatCurrency(value: number | null | undefined, locale: string = 'en-US') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '$0';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatDate(value: string | null | undefined, locale: string = 'en-US') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeAgo(value: string | null | undefined, locale: string = 'en-US') {
  if (!value) return '';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return '';
  const diffMs = Date.now() - ts;
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) {
    return locale.startsWith('es') ? 'hoy' : 'today';
  }
  if (diffDays === 1) {
    return locale.startsWith('es') ? 'hace 1 día' : '1 day ago';
  }
  return locale.startsWith('es') ? `hace ${diffDays} días` : `${diffDays} days ago`;
}
