const admin = require('firebase-admin');
const TRIAL_MS = 72 * 60 * 60 * 1000;
function init() { if (admin.apps.length) return admin.app(); const sa = process.env.FIREBASE_SERVICE_ACCOUNT; if (!sa) return null; return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) }); }
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
  try {
    if (!init()) return res.json({ plan: 'free', status: 'free' });
    const { idToken } = req.body || {};
    if (!idToken) return res.json({ plan: 'free', status: 'free' });
    const dec = await admin.auth().verifyIdToken(idToken);
    const db = admin.firestore();
    const [eSnap, uRec] = await Promise.all([ db.doc('entitlements/' + dec.uid).get(), admin.auth().getUser(dec.uid) ]);
    const ent = eSnap.exists ? eSnap.data() : {};
    const plan = ent.plan || 'free';
    if (plan === 'blocked') return res.json({ plan: 'blocked', status: 'blocked' });
    if (plan === 'active' || plan === 'premium' || plan === 'go') return res.json({ plan, status: 'active' });
    const created = uRec.metadata?.creationTime ? Date.parse(uRec.metadata.creationTime) : 0;
    const elapsed = created ? Date.now() - created : 0;
    if (created && elapsed > TRIAL_MS) return res.json({ plan: 'free', status: 'trial_expired' });
    return res.json({ plan: 'free', status: 'free', trialRemaining: Math.max(0, TRIAL_MS - elapsed) });
  } catch (e) { console.error('[entitlement]', e.message); return res.status(401).json({ plan: 'free', status: 'free' }); }
};
