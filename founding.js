// NeuroCode — Paddle Billing webhook (web ödənişlərinin REAL təsdiqi)
// Paddle → bu endpoint → HMAC imza yoxlaması → Firestore entitlements/{uid}
// Env: FIREBASE_SERVICE_ACCOUNT (mövcud), PADDLE_WEBHOOK_SECRET (Paddle →
//      Developer Tools → Notifications → endpoint yaradanda verilən "secret key")
const admin = require('firebase-admin');
const crypto = require('crypto');

const PLANKEY_MAP = { basic: 'go', pro: 'premium', annual: 'premium' };

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return null;
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Paddle imzası: "ts=...;h1=..." → HMAC-SHA256(secret, ts + ':' + rawBody)
function verifySignature(sigHeader, rawBody, secret) {
  try {
    const parts = Object.fromEntries(String(sigHeader || '').split(';').map(p => p.split('=')));
    if (!parts.ts || !parts.h1) return false;
    const digest = crypto.createHmac('sha256', secret).update(parts.ts + ':' + rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(parts.h1));
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (!initAdmin() || !process.env.PADDLE_WEBHOOK_SECRET)
      return res.status(501).json({ error: 'PADDLE_WEBHOOK_SECRET/FIREBASE_SERVICE_ACCOUNT konfiqurasiya edilməyib' });

    const raw = await readRawBody(req);
    if (!verifySignature(req.headers['paddle-signature'], raw, process.env.PADDLE_WEBHOOK_SECRET))
      return res.status(401).json({ error: 'imza etibarsızdır' });

    const evt = JSON.parse(raw);
    const type = evt.event_type || '';
    const data = evt.data || {};
    const custom = data.custom_data || {};
    const uid = custom.uid;
    if (!uid) return res.status(200).json({ ok: true, note: 'custom_data.uid yoxdur — keçildi' });

    const entRef = admin.firestore().doc('entitlements/' + uid);

    if (type === 'transaction.completed' || type === 'subscription.activated' || type === 'subscription.updated') {
      const plan = PLANKEY_MAP[custom.planKey] || 'premium';
      const ends = (data.billing_period && data.billing_period.ends_at) ? Date.parse(data.billing_period.ends_at) : null;
      await entRef.set({ plan, source: 'paddle', paddleEvent: type,
        expiryTimeMillis: ends, updatedAt: Date.now() }, { merge: true });
      return res.status(200).json({ ok: true, plan });
    }
    if (type === 'subscription.canceled' || type === 'subscription.past_due') {
      await entRef.set({ plan: 'free', source: 'paddle', paddleEvent: type, updatedAt: Date.now() }, { merge: true });
      return res.status(200).json({ ok: true, plan: 'free' });
    }
    return res.status(200).json({ ok: true, note: 'hadisə emal olunmur: ' + type });
  } catch (e) {
    console.error('[paddle-webhook]', e.message);
    return res.status(400).json({ error: 'emal olunmadı' });
  }
};
module.exports.verifySignature = verifySignature; // unit-test üçün
