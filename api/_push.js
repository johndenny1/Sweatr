// Web Push without extra packages: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291).
// The VAPID key pair is derived from the Supabase secret key, so there's nothing extra to set up.
import crypto from 'node:crypto';

const secret = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s).replace(/=+$/, ''), 'base64url');

// P-256 group order
const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

let cached = null;
export function vapidKeys(seed = secret) {
  if (cached && cached.seed === seed) return cached;
  if (!seed) return null;
  let counter = 0;
  let d;
  // Turn the secret into a valid private scalar (1 ≤ d < n)
  do {
    const h = crypto.createHmac('sha256', `sweatr-vapid:${counter++}`).update(seed).digest();
    d = BigInt(`0x${h.toString('hex')}`);
  } while (d === 0n || d >= N);
  const dBuf = Buffer.from(d.toString(16).padStart(64, '0'), 'hex');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(dBuf);
  const pub = ecdh.getPublicKey(); // 65 bytes, uncompressed
  const privateKey = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: b64u(dBuf), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  cached = { seed, publicKey: b64u(pub), privateKey };
  return cached;
}

function vapidHeader(endpoint, keys, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${body}`), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Encrypt a payload for one subscription (single record, aes128gcm)
export function encrypt(payload, p256dh, auth, { salt = crypto.randomBytes(16), ecdh = null } = {}) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const server = ecdh || crypto.createECDH('prime256v1');
  if (!ecdh) server.generateKeys();
  const asPublic = server.getPublicKey();
  const shared = server.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = last record
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

export function pushSubject() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : 'mailto:alerts@sweatr.app';
}

// Send one notification. Returns { ok, gone } — gone means the subscription is dead and should be deleted.
export async function sendPush(sub, message, { ttl = 3600, urgency = 'high' } = {}) {
  const keys = vapidKeys();
  if (!keys) return { ok: false, error: 'No server key' };
  const body = encrypt(JSON.stringify(message), sub.p256dh, sub.auth);
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(sub.endpoint, keys, pushSubject()),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: urgency,
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return { ok: false, gone: true };
    if (!res.ok) return { ok: false, error: `${res.status} ${await res.text().catch(() => '')}`.slice(0, 200) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
