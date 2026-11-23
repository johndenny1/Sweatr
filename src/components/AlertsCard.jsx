import { useEffect, useState } from 'react';
import { pushSupported, isStandalone, isIOS, currentSubscription, enablePush, disablePush, sendTestPush } from '../lib/push.js';

// "Sweat alerts" on/off switch for this device, plus a test buzz.
export default function AlertsCard() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const supported = pushSupported();
  const needsInstall = isIOS() && !isStandalone();

  useEffect(() => {
    currentSubscription()
      .then((s) => setOn(Boolean(s) && Notification.permission === 'granted'))
      .catch(() => {});
  }, []);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        await enablePush();
        setOn(true);
        await sendTestPush().catch(() => {});
        setMsg('You’re in. Check your notifications 👀');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setErr('');
    setMsg('');
    try {
      await sendTestPush();
      setMsg('Sent! Lock your phone and wait a sec.');
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="card stack alerts-card">
      <div className="row between">
        <div>
          <div className="label">Sweat alerts</div>
          <div className="alerts-sub">Get buzzed when legs hit, miss, or get way too close.</div>
        </div>
        {!needsInstall && supported && (
          <button className={`switch ${on ? 'on' : ''}`} onClick={toggle} disabled={busy} aria-pressed={on} aria-label="Sweat alerts">
            <span />
          </button>
        )}
      </div>

      {needsInstall ? (
        <div className="alerts-hint">
          iPhone only allows alerts for apps on your Home Screen. Tap <b>Share</b> → <b>Add to Home Screen</b>, open Sweatr from there,
          then flip this on.
        </div>
      ) : !supported ? (
        <div className="alerts-hint">This browser can’t do notifications. Update iOS (16.4+) or try Chrome/Safari.</div>
      ) : (
        <>
          <ul className="alerts-list">
            <li><span>✅</span> A leg hits</li>
            <li><span>😰</span> A leg is one play away</li>
            <li><span>😳</span> You’re down to the last leg</li>
            <li><span>🪦</span> A leg misses (we’ll be gentle)</li>
            <li><span>💰</span> You cash</li>
          </ul>
          {on && (
            <button className="link small" onClick={test}>
              Send a test alert
            </button>
          )}
        </>
      )}
      {msg && <div className="alerts-ok">{msg}</div>}
      {err && <p className="error small">{err}</p>}
    </div>
  );
}
