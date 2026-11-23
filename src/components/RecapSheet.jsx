import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { drawRecap } from '../lib/recap.js';

// Slip recap = the share sheet with the recap card.
export default function RecapSheet({ parlay, rows, overall, onClose }) {
  return (
    <ShareSheet
      build={() => drawRecap(parlay, rows, overall)}
      kicker="Share your slip"
      title="Sweat Recap"
      fileName={`sweatr-${(parlay.name || 'recap').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}
      shareTitle="My Sweatr recap"
      loadingText="Building your recap…"
      alt="Recap card for this slip"
      onClose={onClose}
    />
  );
}

// Full-screen sheet: builds a share card image, then share it (Instagram, TikTok, Messages…) or save it.
export function ShareSheet({ build, kicker, title, fileName, shareTitle, loadingText, alt, onClose }) {
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    build()
      .then((b) => {
        if (!alive || !b) return;
        setBlob(b);
        setUrl(URL.createObjectURL(b));
      })
      .catch((e) => setError(e.message || 'Could not build the image'));
    return () => {
      alive = false;
    };
    // build once when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  // Lock the page behind the sheet so it can't scroll or show through
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canShare = file && navigator.canShare?.({ files: [file] });

  async function share() {
    try {
      await navigator.share({ files: [file], title: shareTitle });
    } catch {
      // user closed the share sheet
    }
  }

  // Portal to <body>: the page wrapper animates with transform, which would trap a fixed sheet inside it
  return createPortal(
    <div className="recap-sheet" role="dialog" aria-label="Share recap">
      <div className="recap-top">
        <button className="recap-x" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="recap-title">
          <div className="recap-kicker">{kicker}</div>
          <h2>{title}</h2>
        </div>
        <span className="recap-x-spacer" />
      </div>
      <div className="recap-preview">
        {url ? <img src={url} alt={alt} /> : <div className="recap-loading">{error || loadingText}</div>}
      </div>
      <div className="recap-actions">
        {canShare ? (
          <button className="primary big grow recap-share" onClick={share} disabled={!file}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
            </svg>
            Share
          </button>
        ) : (
          <a className={`primary big grow recap-save ${url ? '' : 'disabled'}`} href={url || undefined} download={fileName}>
            Save image
          </a>
        )}
      </div>
      <p className="recap-hint">{canShare ? 'Post it to your Story, send it to the group chat, or save it.' : 'Save it, then post it anywhere.'}</p>
    </div>,
    document.body
  );
}
