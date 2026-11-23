import { useEffect, useState } from 'react';

// Opening animation (~1.8s): the wordmark sharpens in, a sweat drop beads under it,
// falls and splashes into a ripple that makes the logo pulse, then everything fades out.
export const SPLASH_MS = 1800;

export default function Splash({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const total = reduce ? 600 : SPLASH_MS;
    const t1 = setTimeout(() => setLeaving(true), total - 300);
    const t2 = setTimeout(onDone, total);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div className={`splash ${leaving ? 'leaving' : ''}`} aria-hidden="true">
      <div className="splash-glow" />
      <div className="splash-stage">
        <img src="/wordmark.svg" alt="" className="splash-word" />
        <span className="splash-drop" />
        <span className="splash-ripple r1" />
        <span className="splash-ripple r2" />
      </div>
    </div>
  );
}
