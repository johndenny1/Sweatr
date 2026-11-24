// Turns the AI's reply into one slip object, even when it isn't perfectly shaped:
// - one object per screenshot in an array → merged into one slip
// - code fences or extra text around the JSON
// - a reply cut off mid-list (very long slips) → keeps every complete leg
export function parseSlipReply(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  let v = tryParse(t);
  if (v === undefined) {
    const a = t.indexOf('[');
    const o = t.indexOf('{');
    if (a !== -1 && (o === -1 || a < o)) v = tryParse(t.slice(a, t.lastIndexOf(']') + 1));
    if (v === undefined && o !== -1) v = tryParse(t.slice(o, t.lastIndexOf('}') + 1));
  }
  if (v === undefined) v = salvage(t);
  if (v === undefined || v === null) return null;

  const slips = Array.isArray(v) ? v : [v];
  // An array of legs (no wrapper object)
  if (slips.length && slips.every((x) => x && typeof x === 'object' && !('legs' in x) && ('type' in x || 'player' in x))) {
    return { stake: null, odds: null, payout: null, legs: slips };
  }
  const objs = slips.filter((x) => x && typeof x === 'object');
  if (!objs.length) return null;
  const first = (k) => objs.map((x) => x[k]).find((x) => x != null && x !== '');
  return {
    stake: first('stake') ?? null,
    odds: first('odds') ?? null,
    payout: first('payout') ?? null,
    // placed if any screenshot shows it was placed; not placed only if one clearly says so and none says placed
    placed: objs.some((x) => x.placed === true) ? true : objs.some((x) => x.placed === false) ? false : null,
    placed_evidence: first('placed_evidence') ?? null,
    ticket_id: first('ticket_id') ?? null,
    legs: objs.flatMap((x) => (Array.isArray(x.legs) ? x.legs : [])),
  };
}

// Cut-off reply: keep the top-level fields and every leg object that closed properly.
function salvage(t) {
  const start = t.indexOf('"legs"');
  if (start === -1) return undefined;
  const head = t.slice(0, start);
  const num = (k) => {
    const m = head.match(new RegExp(`"${k}"\\s*:\\s*(-?[\\d.]+)`));
    return m ? Number(m[1]) : null;
  };
  const oddsM = head.match(/"odds"\s*:\s*"([^"]*)"/);
  const legs = [];
  const body = t.slice(t.indexOf('[', start) + 1);
  let depth = 0;
  let from = -1;
  let inStr = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') {
      if (depth === 0) from = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && from !== -1) {
        try {
          legs.push(JSON.parse(body.slice(from, i + 1)));
        } catch {}
        from = -1;
      }
    }
  }
  if (!legs.length) return undefined;
  return { stake: num('stake'), payout: num('payout'), odds: oddsM ? oddsM[1] : null, legs };
}
