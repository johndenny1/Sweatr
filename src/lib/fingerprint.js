// A leg's "fingerprint" — the parts that decide whether it wins (bet type, side,
// line). Used to prove a saved slip matches what was scanned off the screenshot.
// Shared by the browser and the server, so keep it dependency-free.

export function normalizeLegShape(leg) {
  const type = String(leg.type || '').toLowerCase();
  const side = leg.side === 'under' ? 'under' : 'over';
  let line = Number(leg.line);
  if ((type === 'prop' || type === 'teamprop') && !Number.isFinite(line)) line = 0.5;
  return {
    type,
    side: type === 'prop' || type === 'teamprop' || type === 'total' ? side : '',
    line: type === 'moneyline' || !Number.isFinite(line) ? '' : Math.round(line * 10) / 10,
  };
}

export function legFingerprint(leg) {
  const s = normalizeLegShape(leg);
  return `${s.type}|${s.side}|${s.line}`;
}

// True if the saved legs are exactly the scanned legs (same count, each paired once),
// so legs can't be dropped while keeping the full slip's odds.
export function legsMatchScan(savedLegs, scannedPrints) {
  if (!Array.isArray(scannedPrints) || savedLegs.length !== scannedPrints.length) return false;
  const pool = [...scannedPrints];
  for (const leg of savedLegs) {
    const i = pool.indexOf(legFingerprint(leg));
    if (i === -1) return false;
    pool.splice(i, 1);
  }
  return savedLegs.length > 0;
}

export function sameOdds(a, b) {
  const n = (x) => Number(String(x ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n(a)) && n(a) !== 0 && n(a) === n(b);
}

export function sameStake(a, b) {
  return Number(a) > 0 && Math.abs(Number(a) - Number(b)) < 0.005;
}
