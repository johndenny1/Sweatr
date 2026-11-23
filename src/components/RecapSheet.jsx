import { useEffect, useState } from 'react';
import { drawRecap } from '../lib/recap.js';

// Full-screen sheet: builds the recap card, then share it (Instagram, TikTok, Messages…) or save it.
export default function RecapSheet({ parlay, rows, overall, onClose }) {
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    drawRecap(parlay, rows, overall)
      .then((b) => {
        if (!alive || !b) return;
        setBlob(b);
        setUrl(URL.createObjectURL(b));
      })
      .catch((e) => setError(e.message || 'Could not build the recap'));
    return () => {
      alive = false;
    };
  }, [parlay, rows, overall]);

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  const fileName = `sweatr-${(parlay.name || 'recap').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canShare = file && navigator.canShare?.({ files: [file] });

  async function share() {
    try {
      await navigator.share({ files: [file], title: 'My Sweatr recap' });
    } catch {
      // user closed the share sheet
    }
  }

  return (
    <div className="recap-sheet" role="dialog" aria-label="Share recap">
      <div className="recap-top">
        <button className="link" onClick={onClose}>
          Close
        </button>
        <div className="label">Sweat recap</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="recap-preview">
        {url ? <img src={url} alt="Recap card for this slip" /> : <div className="recap-loading">{error || 'Building your recap…'}</div>}
      </div>
      <div className="recap-actions">
        {canShare ? (
          <button className="primary big grow" onClick={share} disabled={!file}>
            Share
          </button>
        ) : (
          <a className={`primary big grow recap-save ${url ? '' : 'disabled'}`} href={url || undefined} download={fileName}>
            Save image
          </a>
        )}
      </div>
      {canShare && <p className="muted small center">Pick Instagram for Stories, or Save Image to post anywhere.</p>}
    </div>
  );
}
