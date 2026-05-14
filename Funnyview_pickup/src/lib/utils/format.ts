export function formatKRW(n: number | string | null | undefined): string {
  if (n == null) return '-';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return '-';
  return v.toLocaleString('ko-KR') + '원';
}

export function formatPower(v: string | number | null | undefined): string {
  if (v == null || v === '') return '-';
  const num = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(num)) return '-';
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}`;
}

export function formatRx(item: {
  sphere: string | number | null;
  cylinder?: string | number | null;
  axis?: number | null;
  addPower?: string | number | null;
}): string {
  const parts = [`S ${formatPower(item.sphere)}`];
  if (item.cylinder != null && Number(item.cylinder) !== 0) {
    parts.push(`C ${formatPower(item.cylinder)}`);
    if (item.axis != null) parts.push(`Ax ${item.axis}`);
  }
  if (item.addPower != null && Number(item.addPower) !== 0) {
    parts.push(`Add ${formatPower(item.addPower)}`);
  }
  return parts.join(' / ');
}

export function formatDateTime(iso: string | Date | null): string {
  if (!iso) return '-';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '-';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
