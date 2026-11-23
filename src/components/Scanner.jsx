import { useEffect, useRef, useState } from 'react';
import { readSlip, resolveLegs, MAX_SHOTS } from '../lib/scan.js';
import { CameraIcon, ImageIcon } from './Icons.jsx';

// Camera-style viewfinder: snap a photo or pick screenshots, then watch it scan.
// Long slips: pick several screenshots (or add more after) and they're read as one slip.
export default function Scanner({ onResult, onError }) {
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const addRef = useRef(null);
  const [shots, setShots] = useState([]); // [{ file, url }]
  const [step, setStep] = useState('idle'); // idle | reading | matching | done | error
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function scan(list) {
    setShots((old) => {
      old.filter((o) => !list.includes(o)).forEach((o) => URL.revokeObjectURL(o.url));
      return list;
    });
    try {
      setStep('reading');
      setMessage(list.length > 1 ? `Reading ${list.length} screenshots` : 'Reading your slip');
      const slip = await readSlip(list.map((s) => s.file));
      if (!slip.legs.length) throw new Error("Couldn't find any legs. Try a clearer shot of the slip.");
      setStep('matching');
      setMessage(`Found ${slip.legs.length} leg${slip.legs.length === 1 ? '' : 's'}, matching games`);
      const { matched, unmatched } = await resolveLegs(slip.legs);
      setStep('done');
      setMessage(`${matched.length} leg${matched.length === 1 ? '' : 's'} locked in${unmatched.length ? ` · ${unmatched.length} need a hand` : ''}`);
      setNote(list.length > 1 ? `Merged ${list.length} screenshots · repeated legs counted once` : '');
      onResult({ matched, unmatched, stake: slip.stake, odds: slip.odds, rawLegs: slip.legs, token: slip.token, duplicate: slip.duplicate });
    } catch (err) {
      setStep('error');
      setMessage(err.message);
      setNote('');
      onError?.(err.message);
    }
  }

  const toShots = (files) => files.map((file) => ({ file, url: URL.createObjectURL(file) }));

  // New slip: replaces whatever was there
  function pickNew(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    if (files.length > MAX_SHOTS) setNote(`Using the first ${MAX_SHOTS} screenshots`);
    scan(toShots(files.slice(0, MAX_SHOTS)));
  }

  // More of the same slip: rescans everything together so overlapping legs merge
  function pickMore(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_SHOTS - shots.length;
    scan([...shots, ...toShots(files.slice(0, room))]);
  }

  function removeShot(i) {
    const next = shots.filter((_, j) => j !== i);
    URL.revokeObjectURL(shots[i].url);
    if (next.length) scan(next);
    else {
      setShots([]);
      setStep('idle');
      setMessage('');
      setNote('');
    }
  }

  const busy = step === 'reading' || step === 'matching';
  const canAdd = shots.length > 0 && shots.length < MAX_SHOTS && !busy;

  return (
    <div className="scanner">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pickNew} />
      <input ref={uploadRef} type="file" accept="image/*" multiple hidden onChange={pickNew} />
      <input ref={addRef} type="file" accept="image/*" multiple hidden onChange={pickMore} />

      <button
        className={`viewfinder ${busy ? 'busy' : ''} ${step} ${shots.length > 1 ? 'multi' : ''}`}
        onClick={() => !busy && uploadRef.current?.click()}
        disabled={busy}
      >
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />
        {shots.length === 1 && <img src={shots[0].url} alt="Your bet slip" className="vf-img" />}
        {shots.length > 1 && (
          <div className="vf-strip">
            {shots.map((s, i) => (
              <div key={s.url} className="vf-shot">
                <img src={s.url} alt={`Screenshot ${i + 1}`} />
                <span className="vf-num">{i + 1}</span>
              </div>
            ))}
          </div>
        )}
        {!shots.length && (
          <div className="vf-empty">
            <div className="vf-icon">
              <CameraIcon width={40} height={40} />
            </div>
            <div className="vf-title">Drop your slip</div>
            <div className="muted small">Screenshot or photo, any sportsbook</div>
          </div>
        )}
        {busy && <span className="laser" />}
        {step !== 'idle' && (
          <div className={`vf-status ${step}`}>
            {busy && <span className="spinner" />}
            {step === 'done' && <span className="check">✓</span>}
            {message}
            {busy && <span className="dots" />}
          </div>
        )}
      </button>

      {shots.length > 1 && !busy && (
        <div className="shot-chips">
          {shots.map((s, i) => (
            <button key={s.url} className="shot-chip" onClick={() => removeShot(i)} aria-label={`Remove screenshot ${i + 1}`}>
              <img src={s.url} alt="" />
              <span>{i + 1}</span>
              <b>×</b>
            </button>
          ))}
        </div>
      )}

      {canAdd && (
        <button className="add-shot" onClick={() => addRef.current?.click()}>
          <span>＋</span> Add another screenshot
        </button>
      )}
      {note && <div className="scan-note">{note}</div>}

      <div className="scan-actions">
        <button className="primary grow" disabled={busy} onClick={() => cameraRef.current?.click()}>
          <CameraIcon width={18} height={18} /> Snap
        </button>
        <button className="secondary grow" disabled={busy} onClick={() => uploadRef.current?.click()}>
          <ImageIcon width={18} height={18} /> Screenshot{shots.length ? 's' : ''}
        </button>
      </div>
      {!shots.length && <div className="scan-tip">Long slip? Pick up to {MAX_SHOTS} screenshots at once. Legs that show up in two are only counted once.</div>}
    </div>
  );
}
