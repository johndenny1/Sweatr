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
  won: '#10b981',
  lost: '#ef4444',
};
const BLOCK = '"Archivo Black", "Archivo", system-ui, sans-serif';
const BODY = '"Archivo", system-ui, sans-serif';

// ---------- what the card says ----------
function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function badBeatLine(leg, result) {
  if (leg.type === 'prop' && result.current != null) {
    const label = (statDef(leg.league, leg.stat)?.label || 'stat').toLowerCase();
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
  g.addColorStop(0, story.tone === 'won' ? 'rgba(16,185,129,0.22)' : story.tone === 'lost' ? 'rgba(220,38,38,0.2)' : 'rgba(123,47,247,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  let y = 110;

  // Wordmark
  if (wordmark) {
    const h = 96;
    const w = (wordmark.width / wordmark.height) * h;
    ctx.drawImage(wordmark, (W - w) / 2, y, w, h);
  }
  y += 150;

  // Stamp pill
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

  // Headline
  const hs = fitText(ctx, story.headline, BLOCK, 150, W - 140);
  ctx.save();
  ctx.font = `${hs}px ${BLOCK}`;
  ctx.fillStyle = story.tone === 'won' ? C.won : C.text;
  ctx.shadowColor = story.tone === 'won' ? 'rgba(16,185,129,0.6)' : 'rgba(155,92,255,0.5)';
  ctx.shadowBlur = 36;
  ctx.fillText(story.headline, W / 2, y + hs / 2);
  ctx.restore();
  y += hs + 40;

  // Sub line
  ctx.font = `600 42px ${BODY}`;
  ctx.fillStyle = C.muted;
  for (const line of wrap(ctx, story.sub, W - 180).slice(0, 3)) {
    ctx.fillText(line, W / 2, y + 22);
    y += 56;
  }
  y += 40;

  // Leg list card
  const shown = rows.slice(0, 7);
  const extra = rows.length - shown.length;
  const pad = 44;
  const cardX = 70;
  const cardW = W - 140;
  const textW = cardW - pad * 2 - 170;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const layouts = shown.map((r) => {
    ctx.font = `600 40px ${BODY}`;
    const lines = wrap(ctx, describeLeg(r.leg), textW).slice(0, 2);
    const hasBar = r.result.progress !== undefined;
    return { r, lines, h: 30 + lines.length * 50 + 44 + (hasBar ? 28 : 0) + 26 };
  });
  const listH = layouts.reduce((s, l) => s + l.h, 0) + (extra > 0 ? 70 : 0) + 20;
  const footerSpace = 330;
  const maxListH = H - y - footerSpace;
  const scale = listH > maxListH ? maxListH / listH : 1;

  ctx.save();
  rr(ctx, cardX, y, cardW, listH * scale + 20, 48);
  ctx.fillStyle = 'rgba(22, 14, 38, 0.92)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.line;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(cardX, y + 20);
  ctx.scale(1, scale);
  let ly = 0;
  layouts.forEach((L, i) => {
    const { r } = L;
    const sc = statusColor(r.result.status);
    let yy = ly + 30;
    // league tag
    ctx.font = `28px ${BLOCK}`;
    ctx.fillStyle = C.purpleHi;
    ctx.fillText(r.leg.league.toUpperCase(), pad, yy + 28);
    // description
    ctx.font = `600 40px ${BODY}`;
    ctx.fillStyle = C.text;
    L.lines.forEach((t, j) => ctx.fillText(t, pad + 0, yy + 28 + 50 * (j + 1)));
    yy += 28 + L.lines.length * 50;
    // detail
    ctx.font = `34px ${BODY}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(r.result.summary || r.leg.gameLabel || '', pad, yy + 44);
    yy += 44;
    // status pill
    ctx.font = `30px ${BLOCK}`;
    const st = statusText[r.result.status] || '';
    const pw = ctx.measureText(st).width + 44;
    rr(ctx, cardW - pad - pw, ly + 40, pw, 58, 29);
    ctx.fillStyle = sc === C.muted ? 'rgba(169,159,192,0.15)' : sc === C.won ? 'rgba(16,185,129,0.18)' : sc === C.lost ? 'rgba(239,68,68,0.18)' : 'rgba(179,136,255,0.18)';
    ctx.fill();
    ctx.fillStyle = sc;
    ctx.fillText(st, cardW - pad - pw + 22, ly + 80);
    // progress bar
    if (r.result.progress !== undefined) {
      yy += 22;
      const bw = cardW - pad * 2;
      rr(ctx, pad, yy, bw, 14, 7);
      ctx.fillStyle = 'rgba(155,92,255,0.16)';
      ctx.fill();
      const pw2 = Math.max(14, bw * Math.min(1, Math.max(0, r.result.progress)));
      ctx.save();
      ctx.shadowColor = sc;
      ctx.shadowBlur = 18;
      rr(ctx, pad, yy, pw2, 14, 7);
      ctx.fillStyle = sc === C.muted ? C.purple : sc;
      ctx.fill();
      ctx.restore();
    }
    ly += L.h;
    if (i < layouts.length - 1) {
      ctx.fillStyle = C.line;
      ctx.fillRect(pad, ly - 2, cardW - pad * 2, 2);
    }
  });
  if (extra > 0) {
    ctx.font = `600 36px ${BODY}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(`+${extra} more leg${extra === 1 ? '' : 's'}`, pad, ly + 50);
  }
  ctx.restore();
  y += listH * scale + 20 + 50;

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
    ctx.fillStyle = 'rgba(16,185,129,0.16)';
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
