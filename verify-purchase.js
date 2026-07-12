// NeuroCode — Google Play alış təsdiqi (REAL yoxlama, uydurma uğur YOXDUR)
// Env tələbləri:
//   FIREBASE_SERVICE_ACCOUNT      — Firebase Admin service-account JSON (tam məzmun)
//   PLAY_SERVICE_ACCOUNT          — Play Console-a bağlı Google Cloud service-account
//                                   JSON (tam məzmun; Play Console → API access →
//                                   service account → Finance/Orders icazəsi)
const admin = require('firebase-admin');
const { google } = require('googleapis');

// productId -> PLATFORMA plan açarı (PLAN_LIMITS: free/go/premium)
const PLAN_MAP = { neurocode_go_monthly: 'go', neurocode_premium_monthly: 'premium', neurocode_premium_annual: 'premium' };

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
    if (!initAdmin() || !process.env.PLAY_SERVICE_ACCOUNT)
      return res.status(501).json({ error: 'Service account-lar konfiqurasiya edilməyib', plan: 'free' });

    const { idToken, packageName, productId, purchaseToken } = req.body || {};
    if (!idToken || !packageName || !productId || !purchaseToken)
      return res.status(400).json({ error: 'natamam sorğu', plan: 'free' });

    const decoded = await admin.auth().verifyIdToken(idToken); // real istifadəçi

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.PLAY_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const publisher = google.androidpublisher({ version: 'v3', auth });

    // Abunənin REAL vəziyyətini Google-dan soruş
    const sub = await publisher.purchases.subscriptionsv2.get({ packageName, token: purchaseToken });
    const state = sub.data.subscriptionState; // SUBSCRIPTION_STATE_ACTIVE / _IN_GRACE_PERIOD / ...
    const ok = state === 'SUBSCRIPTION_STATE_ACTIVE' || state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
    if (!ok) return res.status(200).json({ plan: 'free', state });

    const line = (sub.data.lineItems && sub.data.lineItems[0]) || {};
    const plan = PLAN_MAP[productId] || 'premium';
    await admin.firestore().doc('entitlements/' + decoded.uid).set({
      plan, productId, purchaseToken, state,
      expiryTimeMillis: line.expiryTime ? Date.parse(line.expiryTime) : null,
      source: 'google_play', updatedAt: Date.now(),
    }, { merge: true });

    // Acknowledge (3 gün ərzində edilməsə Google ödənişi geri qaytarır)
    try {
      await publisher.purchases.subscriptions.acknowledge({
        packageName, subscriptionId: productId, token: purchaseToken, requestBody: {},
      });
    } catch (e) { /* artıq acknowledge olunubsa xəta normaldır */ }

    return res.status(200).json({ plan });
  } catch (e) {
    console.error('[verify-purchase]', e.message);
    return res.status(400).json({ error: 'təsdiq alınmadı', plan: 'free' });
  }
};
