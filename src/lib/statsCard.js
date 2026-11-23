// "Sweat Report" share card: your all-time numbers as a 1080×1920 story image.
import { rr, fitText, loadImage, C, BLOCK, BODY, W, H } from './recap.js';
import { fmtMoney } from './money.js';
import { displayName, initials } from './profile.jsx';

function vibe(r) {
  if (!r.wins && !r.losses) return { stamp: 'JUST GETTING STARTED', tone: 'live' };
  if (r.streak.type === 'won' && r.streak.count >= 3) return { stamp: `ON A HEATER · W${r.streak.count}`, tone: 'won' };
  if (r.net > 0 && r.roi > 0.5) return { stamp: 'PRINTING MONEY', tone: 'won' };
  if (r.net > 0) return { stamp: 'IN THE GREEN', tone: 'won' };
  if (r.net === 0) return { stamp: 'EVEN STEVEN', tone: 'live' };
  if (r.streak.type === 'lost' && r.streak.count >= 3) return { stamp: 'DUE FOR A HEATER', tone: 'lost' };
  return { stamp: 'DOWN BAD (FOR NOW)', tone: 'lost' };
}

function loadAvatar(src) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function drawStatsCard(user, r, points) {
  await Promise.all([
    document.fonts?.load?.(`80px "Archivo Black"`),
    document.fonts?.load?.(`600 40px "Archivo"`),
  ]).catch(() => {});
  const [wordmark, avatar] = await Promise.all([loadImage('/wordmark.svg'), loadAvatar(user?.user_metadata?.avatar_url)]);

  const v = vibe(r);
  const accent = v.tone === 'won' ? C.won : v.tone === 'lost' ? C.lost : C.purpleHi;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W / 2, 420, 40, W / 2, 420, 950);
  g.addColorStop(0, 'rgba(123, 47, 247, 0.45)');
  g.addColorStop(1, 'rgba(123, 47, 247, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W / 2, H - 260, 20, W / 2, H - 260, 760);
  g.addColorStop(0, v.tone === 'won' ? 'rgba(47,227,154,0.2)' : v.tone === 'lost' ? 'rgba(255,77,109,0.18)' : 'rgba(123,47,247,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // wordmark
  let y = 96;
  if (wordmark) {
    const h = 84;
    const w = (wordmark.width / wordmark.height) * h;
    ctx.drawImage(wordmark, (W - w) / 2, y, w, h);
  }
  y += 140;

  // avatar + name
  const av = 150;
  ctx.save();
  ctx.shadowColor = 'rgba(155,92,255,0.8)';
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(W / 2, y + av / 2, av / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = C.purple;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, y + av / 2, av / 2, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    const s = Math.min(avatar.width, avatar.height);
    ctx.drawImage(avatar, (avatar.width - s) / 2, (avatar.height - s) / 2, s, s, W / 2 - av / 2, y, av, av);
  } else {
    const gg = ctx.createLinearGradient(W / 2 - av / 2, y, W / 2 + av / 2, y + av);
    gg.addColorStop(0, '#7b2ff7');
    gg.addColorStop(1, '#3a1580');
    ctx.fillStyle = gg;
    ctx.fillRect(W / 2 - av / 2, y, av, av);
    ctx.fillStyle = '#fff';
    ctx.font = `60px ${BLOCK}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(displayName(user)), W / 2, y + av / 2 + 4);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  y += av + 74;
  const name = displayName(user).toUpperCase();
  fitText(ctx, name, BLOCK, 64, W - 200);
  ctx.fillStyle = C.text;
  ctx.fillText(name, W / 2, y);
  y += 46;

  // vibe stamp
  ctx.font = `34px ${BLOCK}`;
  const sw = ctx.measureText(v.stamp).width + 70;
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 24;
  rr(ctx, (W - sw) / 2, y, sw, 70, 35);
  ctx.lineWidth = 4;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = accent;
  ctx.textBaseline = 'middle';
  ctx.fillText(v.stamp, W / 2, y + 37);
  ctx.textBaseline = 'alphabetic';
  y += 120;

  // big number
  ctx.font = `600 34px ${BODY}`;
  ctx.fillStyle = C.muted;
  ctx.fillText('ALL-TIME PROFIT', W / 2, y);
  y += 20;
  const net = fmtMoney(r.net, { sign: true });
  const ns = fitText(ctx, net, BLOCK, 190, W - 160);
  ctx.save();
  ctx.fillStyle = r.net > 0 ? C.won : r.net < 0 ? C.lost : C.text;
  ctx.shadowColor = r.net > 0 ? 'rgba(47,227,154,0.55)' : r.net < 0 ? 'rgba(255,77,109,0.5)' : 'rgba(155,92,255,0.5)';
  ctx.shadowBlur = 40;
  ctx.fillText(net, W / 2, y + ns * 0.82);
  ctx.restore();
  y += ns * 0.82 + 56;
  ctx.font = `600 36px ${BODY}`;
  ctx.fillStyle = C.muted;
  const roi = r.roi == null ? '' : `${r.roi > 0 ? '+' : ''}${Math.round(r.roi * 100)}% ROI · `;
  ctx.fillText(`${roi}${fmtMoney(r.staked)} wagered`, W / 2, y);
  y += 50;

  // profit chart
  const cx = 70;
  const cw = W - 140;
  const ch = 330;
  ctx.save();
  rr(ctx, cx, y, cw, ch, 44);
  ctx.fillStyle = 'rgba(22, 14, 38, 0.92)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.line;
  ctx.stroke();
  ctx.restore();
  if (points.length >= 2) {
    const px = cx + 40;
    const pw = cw - 80;
    const py = y + 50;
    const ph = ch - 100;
    const vals = points.map((p) => p.value);
    let lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (hi === lo) hi = lo + 1;
    const X = (i) => px + (i / (points.length - 1)) * pw;
    const Y = (val) => py + ph - ((val - lo) / (hi - lo)) * ph;
    const lineColor = vals[vals.length - 1] >= 0 ? C.won : C.lost;
    // zero line
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = 'rgba(169,159,192,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, Y(0));
    ctx.lineTo(px + pw, Y(0));
    ctx.stroke();
    ctx.setLineDash([]);
    // fill
    const fill = ctx.createLinearGradient(0, py, 0, py + ph);
    fill.addColorStop(0, lineColor === C.won ? 'rgba(47,227,154,0.35)' : 'rgba(255,77,109,0.3)');
    fill.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    points.forEach((p, i) => ctx.lineTo(X(i), Y(p.value)));
    ctx.lineTo(X(points.length - 1), Y(0));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    // line
    ctx.save();
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 22;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(X(i), Y(p.value)) : ctx.moveTo(X(i), Y(p.value))));
    ctx.stroke();
    ctx.restore();
    const lx = X(points.length - 1);
    const ly = Y(vals[vals.length - 1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  } else {
    ctx.font = `600 34px ${BODY}`;
    ctx.fillStyle = C.muted;
    ctx.fillText('Profit chart shows up after your first settled slip', W / 2, y + ch / 2 + 12);
  }
  y += ch + 40;

  // stat tiles 3×2
  const tiles = [
    ['RECORD', `${r.wins}-${r.losses}`],
    ['HIT RATE', r.winRate == null ? '–' : `${Math.round(r.winRate * 100)}%`],
    ['BIGGEST HIT', r.biggest.profit > 0 ? fmtMoney(r.biggest.profit, { sign: true }) : '–'],
    ['STREAK', r.streak.count ? `${r.streak.type === 'won' ? 'W' : 'L'}${r.streak.count}` : '–'],
    ['SLIPS', String(r.total)],
    ['AVG LEGS', r.avgLegs ? r.avgLegs.toFixed(1) : '–'],
  ];
  const gap = 22;
  const tw = (cw - gap * 2) / 3;
  const th = 150;
  tiles.forEach(([k, val], i) => {
    const tx = cx + (i % 3) * (tw + gap);
    const ty = y + Math.floor(i / 3) * (th + gap);
    rr(ctx, tx, ty, tw, th, 32);
    ctx.fillStyle = 'rgba(22, 14, 38, 0.92)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.line;
    ctx.stroke();
    ctx.font = `600 26px ${BODY}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(k, tx + tw / 2, ty + 50);
    const vs = fitText(ctx, val, BLOCK, 54, tw - 30);
    ctx.fillStyle = k === 'BIGGEST HIT' && val !== '–' ? C.won : k === 'STREAK' && val.startsWith('W') ? C.won : k === 'STREAK' && val.startsWith('L') ? C.lost : C.text;
    ctx.font = `${vs}px ${BLOCK}`;
    ctx.fillText(val, tx + tw / 2, ty + 115);
  });
  y += th * 2 + gap + 50;

  // last 10
  if (r.form.length) {
    ctx.font = `600 28px ${BODY}`;
    ctx.fillStyle = C.muted;
    ctx.fillText('LAST ' + r.form.length, W / 2, y);
    y += 26;
    const d = 62;
    const g2 = 16;
    const form = [...r.form].reverse();
    const total = form.length * d + (form.length - 1) * g2;
    form.forEach((f, i) => {
      const fx = (W - total) / 2 + i * (d + g2) + d / 2;
      ctx.save();
      ctx.shadowColor = f === 'won' ? C.won : C.lost;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(fx, y + d / 2, d / 2, 0, Math.PI * 2);
      ctx.fillStyle = f === 'won' ? C.won : C.lost;
      ctx.fill();
      ctx.restore();
      ctx.font = `30px ${BLOCK}`;
      ctx.fillStyle = f === 'won' ? '#04140d' : '#1a0308';
      ctx.textBaseline = 'middle';
      ctx.fillText(f === 'won' ? 'W' : 'L', fx, y + d / 2 + 2);
      ctx.textBaseline = 'alphabetic';
    });
  }

  // footer
  ctx.font = `30px ${BLOCK}`;
  ctx.fillStyle = C.won;
  ctx.fillText('✓ VERIFIED SLIPS ONLY', W / 2, H - 120);
  ctx.font = `600 32px ${BODY}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(window.location.host ? `Track your sweat on Sweatr · ${window.location.host}` : 'Track your sweat on Sweatr', W / 2, H - 66);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
