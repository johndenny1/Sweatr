// Live grading for many slips at once (used by Sweat Rooms). Shares box scores between slips.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getBox } from './api.js';
import { evaluateLeg, parlayStatus } from './evaluate.js';

const REFRESH_MS = 30_000;

export function useLiveSlips(parlays) {
  const [boxes, setBoxes] = useState({});
  const [updated, setUpdated] = useState(null);
  const keys = [...new Set(parlays.flatMap((p) => (p.legs || []).map((l) => `${l.league}:${l.gameId}`)))].sort();
  const keyStr = keys.join('|');

  const refresh = useCallback(async () => {
    if (!keyStr) return;
    const list = keyStr.split('|');
    const res = await Promise.allSettled(
      list.map((k) => {
        const [league, gameId] = k.split(':');
        return getBox(league, gameId).then((b) => [k, b]);
      })
    );
    setBoxes((prev) => {
      const next = { ...prev };
      for (const r of res) if (r.status === 'fulfilled') next[r.value[0]] = r.value[1];
      return next;
    });
    setUpdated(new Date());
  }, [keyStr]);

  const allFinal = keys.length > 0 && keys.every((k) => boxes[k]?.game?.isFinal);
  useEffect(() => {
    refresh();
    if (allFinal) return;
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh, allFinal]);

  const results = {};
  for (const p of parlays) {
    const rows = (p.legs || []).map((leg) => {
      const box = boxes[`${leg.league}:${leg.gameId}`];
      return { leg, box, result: evaluateLeg(leg, box?.game, box?.players) };
    });
    const loaded = rows.length > 0 && rows.every((r) => r.box);
    results[p.id] = { rows, loaded, overall: rows.length ? parlayStatus(rows.map((r) => r.result)) : 'pending' };
  }
  return { results, updated };
}

// Watches leg results and reports the moment a leg hits or misses.
export function useLegMoments(parlays, results, onMoment) {
  const seen = useRef({});
  const cb = useRef(onMoment);
  cb.current = onMoment;
  useEffect(() => {
    for (const p of parlays) {
      const r = results[p.id];
      if (!r?.loaded) continue;
      r.rows.forEach(({ leg, result }, i) => {
        const key = `${p.id}:${i}`;
        const before = seen.current[key];
        seen.current[key] = result.status;
        if (before && before !== result.status && (result.status === 'won' || result.status === 'lost')) {
          cb.current?.({ parlay: p, leg, result });
        }
      });
      const okey = `${p.id}:overall`;
      const ob = seen.current[okey];
      seen.current[okey] = r.overall;
      if (ob && ob !== r.overall && (r.overall === 'won' || r.overall === 'lost')) cb.current?.({ parlay: p, overall: r.overall });
    }
  }, [parlays, results]);
}
