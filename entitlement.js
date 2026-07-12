// NeuroCode — Server-səlahiyyətli abunə entitlement endpoint-i
// Env tələbləri: FIREBASE_SERVICE_ACCOUNT (Firebase Console → Project Settings →
// Service Accounts → Generate new private key → JSON-un TAM məzmunu)
const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return null;
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (!initAdmin()) return res.status(501).json({ error: 'FIREBASE_SERVICE_ACCOUNT konfiqurasiya edilməyib', plan: 'free' });
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: 'idToken tələb olunur', plan: 'free' });
    const decoded = await admin.auth().verifyIdToken(idToken);
    const snap = await admin.firestore().doc('entitlements/' + decoded.uid).get();
    const data = snap.exists ? snap.data() : null;
    // Müddəti bitmiş abunəni free-yə endir
    const active = data && data.plan && data.plan !== 'free' &&
      (!data.expiryTimeMillis || Number(data.expiryTimeMillis) > Date.now());
    return res.status(200).json({ plan: active ? data.plan : 'free' });
  } catch (e) {
    console.error('[entitlement]', e.message);
    return res.status(401).json({ error: 'token etibarsızdır', plan: 'free' });
  }
};
