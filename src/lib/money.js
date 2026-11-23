// American odds ("+650", "-110") → decimal multiplier (7.5, 1.909)
export function americanToDecimal(odds) {
  const n = Number(String(odds ?? '').replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}

// Total return if the parlay hits (stake included)
export function payoutFor(stake, odds) {
  const s = Number(stake);
  const d = americanToDecimal(odds);
  if (!Number.isFinite(s) || s <= 0 || !d) return null;
  return Math.round(s * d * 100) / 100;
}

export function toWin(stake, odds) {
  const p = payoutFor(stake, odds);
  return p == null ? null : Math.round((p - Number(stake)) * 100) / 100;
}

export function fmtMoney(n, { sign = false } = {}) {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  const v = Number(n);
  const abs = Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: v % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  if (!sign) return `${v < 0 ? '-' : ''}$${abs}`;
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}$${abs}`;
}
