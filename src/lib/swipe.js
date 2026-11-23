import { useEffect } from 'react';

// Drag from the left edge of the screen to go back, like a native iOS app.
// The page follows your finger; let go past ~1/3 of the screen (or flick) to go back.
export function useEdgeSwipeBack(ref, getTarget, onBack) {
  useEffect(() => {
    const EDGE = 28;
    let start = null;

    const el = () => ref.current;

    function onStart(e) {
      const t = e.touches[0];
      if (t.clientX > EDGE || !getTarget()) return;
      start = { x: t.clientX, y: t.clientY, time: Date.now(), dragging: false };
    }

    function onMove(e) {
      if (!start || !el()) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!start.dragging) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) return (start = null); // vertical scroll wins
        if (dx > 8) start.dragging = true;
      }
      if (start.dragging) {
        e.preventDefault();
        const x = Math.max(0, dx);
        el().style.animation = 'none'; // the slide-in animation would otherwise pin the page in place
        el().style.transition = 'none';
        el().style.transform = `translateX(${x}px)`;
        el().style.opacity = String(1 - Math.min(x / window.innerWidth, 1) * 0.35);
      }
    }

    function onEnd(e) {
      if (!start || !el()) return (start = null);
      const node = el();
      const dx = (e.changedTouches[0]?.clientX ?? start.x) - start.x;
      const speed = dx / Math.max(Date.now() - start.time, 1);
      const wasDragging = start.dragging;
      start = null;
      if (!wasDragging) return;
      const target = getTarget();
      if (target && (dx > window.innerWidth / 3 || speed > 0.6)) {
        node.style.transition = 'transform 140ms ease-out, opacity 140ms ease-out';
        node.style.transform = `translateX(${window.innerWidth}px)`;
        node.style.opacity = '0.4';
        setTimeout(() => onBack(target), 120);
      } else {
        node.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1), opacity 180ms';
        node.style.transform = '';
        node.style.opacity = '';
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, getTarget, onBack]);
}
