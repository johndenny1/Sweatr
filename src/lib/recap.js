// Draws a 1080×1920 "Sweat Recap" story card for a slip, on the phone, with <canvas>.
import { describeLeg } from './evaluate.js';
import { statDef } from './stats.js';
import { payoutFor, toWin, fmtMoney } from './money.js';

const W = 1080;
const H = 1920;
const C = {
  bg: '#000000',
  card: '#120c1e',
  line: 'rgba(155, 92, 255, 0.22)',
  text: '#f4f0fb',
  muted: '#a99fc0',
  purple: '#9b5cff',
  purpleHi: '#b388ff',
  won: '#2fe39a',
  lost: '#ff4d6d',
};
const BLOCK = '"Archivo Black", "Archivo", system-ui, sans-serif';
const BODY = '"Archivo", system-ui, sans-serif';

// ---------- what the card says ----------
function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function badBeatLine(leg, result) {
  if (leg.type === 'prop' && result.current != null) {
    const label = statDef(leg.league, leg.stat)?.label || 'stat';
    return leg.side === 'over'
      ? `${leg.playerName} finished at ${fmtNum(result.current)} ${label}. Needed ${fmtNum(leg.line)}.`
      : `${leg.playerName} hit ${fmtNum(result.current)} ${label}. Needed under ${fmtNum(leg.line)}.`;
  }
  return `${describeLeg(leg)} missed · ${result.summary}`;
}

// How close a missed leg came (smaller = more painful)
function missMargin(leg, result) {
  if (leg.type === 'prop' && result.current != null && Number(leg.line) > 0) {
    return Math.abs(Number(leg.line) - result.current) / Number(leg.line);
  }
  return 1;
}

export function recapStory(parlay, rows, overall) {
  const n = rows.length;
  const hits = rows.filter((r) => r.result.status === 'won').length;
  const lost = rows.filter((r) => r.result.status === 'lost');
  const win = toWin(parlay.stake, parlay.odds);
  const paid = parlay.payout ?? payoutFor(parlay.stake, parlay.odds);

  if (overall === 'won') {
    return {
      tone: 'won',
      stamp: 'CASHED',
      headline: win != null ? `+${fmtMoney(win)}` : `${n}/${n} HIT`,
      sub: paid != null ? `${fmtMoney(parlay.stake)} turned into ${fmtMoney(paid)}` : `Every leg hit.`,
    };
  }
  if (overall === 'lost') {
    if (lost.length === 1) {
      const r = lost[0];
      return { tone: 'lost', stamp: 'BAD BEAT', headline: '1 LEG AWAY', sub: badBeatLine(r.leg, r.result) };
    }
    const worst = [...lost].sort((a, b) => missMargin(a.leg, a.result) - missMargin(b.leg, b.result))[0];
    return {
      tone: 'lost',
      stamp: 'BUSTED',
      headline: `${hits} OF ${n} HIT`,
      sub: worst ? `Closest miss: ${badBeatLine(worst.leg, worst.result)}` : 'Next one.',
    };
  }
  return {
    tone: 'live',
    stamp: 'SWEATING',
    headline: `${hits} OF ${n} HIT`,
    sub: win != null ? `Live for ${fmtMoney(win)}` : 'Still alive.',
  };
}

// ---------- drawing helpers ----------
function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(ctx, text, font, maxSize, maxWidth) {
  let size = maxSize;
  do {
    ctx.font = `${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 40);
  return size;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const toneColor = (t) => (t === 'won' ? C.won : t === 'lost' ? C.lost : C.purpleHi);
const statusColor = (s) => (s === 'won' ? C.won : s === 'lost' ? C.lost : s === 'live' ? C.purpleHi : C.muted);
const statusText = { won: 'HIT', lost: 'MISS', live: 'LIVE', pending: 'SOON', push: 'PUSH' };

// ---------- main ----------
export async function drawRecap(parlay, rows, overall) {
  await Promise.all([
    document.fonts?.load?.(`80px "Archivo Black"`),
    document.fonts?.load?.(`40px "Archivo"`),
    document.fonts?.load?.(`600 40px "Archivo"`),
  ]).catch(() => {});
  const wordmark = await loadImage('/wordmark.svg');

  const story = recapStory(parlay, rows, overall);
  const accent = toneColor(story.tone);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background: black with a purple haze, plus a glow in the result color
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W / 2, 360, 40, W / 2, 360, 900);
  g.addColorStop(0, 'rgba(123, 47, 247, 0.42)');
  g.addColorStop(1, 'rgba(123, 47, 247, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W / 2, H - 200, 20, W / 2, H - 200, 700);
  g.addColorStop(0, story.tone === 'won' ? 'rgba(47,227,154,0.22)' : story.tone === 'lost' ? 'rgba(255,77,109,0.2)' : 'rgba(123,47,247,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // ---- measure the header so the whole card can be balanced vertically ----
  ctx.textAlign = 'center';
  const hs = fitText(ctx, story.headline, BLOCK, 150, W - 140);
  ctx.font = `600 42px ${BODY}`;
  const subLines = wrap(ctx, story.sub, W - 180).slice(0, 2);
  const headerH = 150 + (hs + 40) + subLines.length * 56 + 40;

  // ---- leg list layout (never stretched; fewer legs shown instead) ----
  const pad = 44;
  const cardX = 70;
  const cardW = W - 140;
  const textW = cardW - pad * 2 - 170;
  const listTop0 = 110 + 150 + headerH; // with no extra spacing
  const moneyH = 140;
  const bottomLimit = H - (parlay.verified ? 220 : 120) - moneyH;
  const avail = bottomLimit - listTop0 - 40;

  const priority = { lost: 0, live: 1, won: 2, push: 3, pending: 4 };
  const measure = (r, compact) => {
    ctx.font = compact ? `600 36px ${BODY}` : `600 40px ${BODY}`;
    let lines = wrap(ctx, describeLeg(r.leg), textW);
    if (compact || lines.length > 2) {
      const keep = compact ? 1 : 2;
      if (lines.length > keep) {
        lines = lines.slice(0, keep);
        let last = lines[keep - 1];
        while (ctx.measureText(last + '…').width > textW && last.length > 1) last = last.slice(0, -1);
        lines[keep - 1] = last.trimEnd() + '…';
      }
    }
    const hasBar = r.result.progress !== undefined;
    const lh = compact ? 44 : 50;
    return { r, lines, compact, lh, h: (compact ? 20 : 58) + lines.length * lh + (compact ? 40 : 44) + (hasBar ? 28 : 0) + (compact ? 20 : 26) };
  };
  const total = (ls, extra) => ls.reduce((s, l) => s + l.h, 0) + (extra > 0 ? 70 : 0) + 20;

  let layouts = rows.map((r) => measure(r, false));
  let extra = 0;
  if (total(layouts, 0) > avail) {
    layouts = rows.map((r) => measure(r, true));
    if (total(layouts, 0) > avail) {
      // keep the legs that matter most (misses, then live), in slip order
      const order = rows.map((r, i) => i).sort((a, b) => (priority[rows[a].result.status] ?? 5) - (priority[rows[b].result.status] ?? 5) || a - b);
      let keep = rows.length;
      while (keep > 1) {
        const picked = new Set(order.slice(0, keep));
        const ls = layouts.filter((_, i) => picked.has(i));
        if (total(ls, rows.length - keep) <= avail) break;
        keep--;
      }
      const picked = new Set(order.slice(0, keep));
      layouts = layouts.filter((_, i) => picked.has(i));
      extra = rows.length - keep;
    }
  }
  const listH = total(layouts, extra);
  const slack = Math.max(0, avail - listH);
  const gapTop = slack / 2;

  // ---- draw header ----
  let y = 110;
  if (wordmark) {
    const h = 96;
    const w = (wordmark.width / wordmark.height) * h;
    ctx.drawImage(wordmark, (W - w) / 2, y, w, h);
  }
  y += 150 + gapTop;

  ctx.font = `44px ${BLOCK}`;
  const stampW = ctx.measureText(story.stamp).width + 80;
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 30;
  rr(ctx, (W - stampW) / 2, y, stampW, 86, 43);
  ctx.lineWidth = 5;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(story.stamp, W / 2, y + 45);
  y += 150;

  ctx.save();
  ctx.font = `${hs}px ${BLOCK}`;
  ctx.fillStyle = story.tone === 'won' ? C.won : C.text;
  ctx.shadowColor = story.tone === 'won' ? 'rgba(47,227,154,0.6)' : 'rgba(155,92,255,0.5)';
  ctx.shadowBlur = 36;
  ctx.fillText(story.headline, W / 2, y + hs / 2);
  ctx.restore();
  y += hs + 40;

  ctx.font = `600 42px ${BODY}`;
  ctx.fillStyle = C.muted;
  for (const line of subLines) {
    ctx.fillText(line, W / 2, y + 22);
    y += 56;
  }
  y += 40;

  // ---- leg card ----
  ctx.save();
  rr(ctx, cardX, y, cardW, listH, 48);
  ctx.fillStyle = 'rgba(22, 14, 38, 0.92)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.line;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(cardX, y + 10);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let ly = 0;
  layouts.forEach((L, i) => {
    const { r, compact, lh } = L;
    const sc = statusColor(r.result.status);
    let yy = ly + (compact ? 20 : 30);
    if (!compact) {
      ctx.font = `28px ${BLOCK}`;
      ctx.fillStyle = C.purpleHi;
      ctx.fillText(r.leg.league.toUpperCase(), pad, yy + 24);
      yy += 28;
    }
    ctx.font = `600 ${compact ? 36 : 40}px ${BODY}`;
    ctx.fillStyle = C.text;
    L.lines.forEach((t, j) => ctx.fillText(t, pad, yy + lh * (j + 1) - 8));
    yy += L.lines.length * lh;
    ctx.font = `${compact ? 30 : 34}px ${BODY}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(r.result.summary || r.leg.gameLabel || '', pad, yy + (compact ? 34 : 38));
    yy += compact ? 40 : 44;
    // status pill
    ctx.font = `${compact ? 28 : 30}px ${BLOCK}`;
    const st = statusText[r.result.status] || '';
    const pw = ctx.measureText(st).width + 44;
    const ph = compact ? 52 : 58;
    const py = ly + (compact ? 22 : 40);
    rr(ctx, cardW - pad - pw, py, pw, ph, ph / 2);
    ctx.fillStyle = sc === C.muted ? 'rgba(169,159,192,0.15)' : sc === C.won ? 'rgba(47,227,154,0.18)' : sc === C.lost ? 'rgba(255,77,109,0.18)' : 'rgba(179,136,255,0.18)';
    ctx.fill();
    ctx.fillStyle = sc;
    ctx.textBaseline = 'middle';
    ctx.fillText(st, cardW - pad - pw + 22, py + ph / 2 + 2);
    ctx.textBaseline = 'alphabetic';
    if (r.result.progress !== undefined) {
      yy += 10;
      const bw = cardW - pad * 2;
      rr(ctx, pad, yy, bw, 12, 6);
      ctx.fillStyle = 'rgba(155,92,255,0.16)';
      ctx.fill();
      const pw2 = Math.max(12, bw * Math.min(1, Math.max(0, r.result.progress)));
      ctx.save();
      ctx.shadowColor = sc;
      ctx.shadowBlur = 18;
      rr(ctx, pad, yy, pw2, 12, 6);
      ctx.fillStyle = sc === C.muted ? C.purple : sc;
      ctx.fill();
      ctx.restore();
    }
    ly += L.h;
    if (i < layouts.length - 1 || extra > 0) {
      ctx.fillStyle = C.line;
      ctx.fillRect(pad, ly - 2, cardW - pad * 2, 2);
    }
  });
  if (extra > 0) {
    ctx.font = `600 34px ${BODY}`;
    ctx.fillStyle = C.muted;
    const hiddenAllHit = rows.filter((r) => !layouts.some((L) => L.r === r)).every((r) => r.result.status === 'won');
    ctx.fillText(`+${extra} more leg${extra === 1 ? '' : 's'}${hiddenAllHit ? ' hit' : ''}`, pad, ly + 46);
  }
  ctx.restore();
  y += listH + 70;

  // Money row
  ctx.textAlign = 'center';
  const paid = parlay.payout ?? payoutFor(parlay.stake, parlay.odds);
  const cols = [
    ['STAKE', parlay.stake != null ? fmtMoney(parlay.stake) : '–'],
    ['ODDS', parlay.odds || '–'],
    [overall === 'won' ? 'PAID' : overall === 'lost' ? 'COULD HAVE WON' : 'TO WIN', overall === 'won' ? fmtMoney(paid) : fmtMoney(toWin(parlay.stake, parlay.odds))],
  ];
  cols.forEach(([k, v], i) => {
    const cx = 70 + (cardW / 3) * i + cardW / 6;
    ctx.font = `30px ${BODY}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(k, cx, y);
    ctx.font = `54px ${BLOCK}`;
    ctx.fillStyle = i === 2 && overall === 'won' ? C.won : C.text;
    ctx.fillText(v, cx, y + 66);
  });
  y += 140;

  // Footer: verified + tagline
  ctx.font = `32px ${BLOCK}`;
  if (parlay.verified) {
    const t = '✓ VERIFIED SLIP';
    const tw = ctx.measureText(t).width + 60;
    rr(ctx, (W - tw) / 2, H - 200, tw, 66, 33);
    ctx.fillStyle = 'rgba(47,227,154,0.16)';
    ctx.fill();
    ctx.fillStyle = C.won;
    ctx.textBaseline = 'middle';
    ctx.fillText(t, W / 2, H - 166);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 34px ${BODY}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(window.location.host ? `Sweated live on Sweatr · ${window.location.host}` : "Sweated live on Sweatr", W / 2, H - 70);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export { rr, wrap, fitText, loadImage, C, BLOCK, BODY, W, H };
