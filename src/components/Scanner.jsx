import { useEffect, useRef, useState } from 'react';
import { readSlip, resolveLegs } from '../lib/scan.js';
import { CameraIcon, ImageIcon } from './Icons.jsx';

// Camera-style viewfinder: snap a photo or pick a screenshot, then watch it scan.
export default function Scanner({ onResult, onError }) {
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [step, setStep] = useState('idle'); // idle | reading | matching | done | error
  const [message, setMessage] = useState('');

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  async function handle(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    try {
      setStep('reading');
      setMessage('Reading your slip');
      const slip = await readSlip(file);
      if (!slip.legs.length) throw new Error("Couldn't find any legs. Try a clearer shot of the slip.");
      setStep('matching');
      setMessage(`Found ${slip.legs.length} leg${slip.legs.length === 1 ? '' : 's'}, matching games`);
      const { matched, unmatched } = await resolveLegs(slip.legs);
      setStep('done');
      setMessage(`${matched.length} leg${matched.length === 1 ? '' : 's'} locked in${unmatched.length ? ` · ${unmatched.length} need a hand` : ''}`);
      onResult({ matched, unmatched, stake: slip.stake, odds: slip.odds, rawLegs: slip.legs, token: slip.token, duplicate: slip.duplicate });
    } catch (err) {
      setStep('error');
      setMessage(err.message);
      onError?.(err.message);
    }
  }

  const busy = step === 'reading' || step === 'matching';

  return (
    <div className="scanner">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input ref={uploadRef} type="file" accept="image/*" hidden onChange={handle} />

      <button
        className={`viewfinder ${busy ? 'busy' : ''} ${step}`}
        onClick={() => !busy && uploadRef.current?.click()}
        disabled={busy}
      >
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />
        {preview ? (
          <img src={preview} alt="Your bet slip" className="vf-img" />
        ) : (
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

      <div className="scan-actions">
        <button className="primary grow" disabled={busy} onClick={() => cameraRef.current?.click()}>
          <CameraIcon width={18} height={18} /> Snap
        </button>
        <button className="secondary grow" disabled={busy} onClick={() => uploadRef.current?.click()}>
          <ImageIcon width={18} height={18} /> Screenshot
        </button>
      </div>
    </div>
  );
}
