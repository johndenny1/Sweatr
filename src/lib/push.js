// Turning push alerts on/off for this device.
import { supabase } from './supabase.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () =>
  window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

async function call(body) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong');
  return json;
}

function keyBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('This browser can’t do notifications');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Turn them on in Settings → Notifications → Sweatr.');
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const { publicKey } = await fetch('/api/push').then((r) => r.json());
  if (!publicKey) throw new Error('Alerts aren’t set up on the server yet');
  let sub = await reg.pushManager.getSubscription();
  // If the server key changed, start fresh
  const existingKey = sub?.options?.applicationServerKey;
  if (sub && existingKey) {
    const a = new Uint8Array(existingKey);
    const b = keyBytes(publicKey);
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await call({ action: 'subscribe', subscription: sub.toJSON() });
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await call({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export const sendTestPush = () => call({ action: 'test' });
