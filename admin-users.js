// NeuroCode — Founding 100 proqramı (atomik, unikal, server-səlahiyyətli)
// GET  (açarsız)              → {count, closed}                    — public sayğac
// GET  + Authorization: Bearer <owner idToken> → {count, closed, members} — YALNIZ owner
// POST {idToken, name}        → {number, count} | {closed:true}    — yer iddiası
// Env: FIREBASE_SERVICE_ACCOUNT (mövcud), OWNER_EMAIL (superadmin e-maili)
//
// QAYDA (bir sətirdə dəyişilə bilər, aşağıda işarələnib): ilk 100 üzvə
// entitlements/{uid} = {plan:'premium', source:'founding'} yazılır —
// yəni Founding üzvləri paywall-dan ömürlük azaddır.
const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return null;
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (!initAdmin()) return res.status(501).json({ error: 'FIREBASE_SERVICE_ACCOUNT konfiqurasiya edilməyib' });
    const db = admin.firestore();
    const counterRef = db.doc('counters/founding');

    if (req.method === 'GET') {
      const snap = await counterRef.get();
      const count = (snap.exists && snap.data().count) || 0;
      const base = { count: Math.min(count, 100), closed: count >= 100 };
      // ── SUPERADMIN/OWNER İCAZƏSİ (server tərəfində, YEGANƏ yol) ──
      // Yalnız Firebase Auth idToken-i doğrulanmış və e-maili env OWNER_EMAIL-ə
      // DƏQİQ bərabər olan hesab siyahını ala bilər. Paylaşılan açar/parol yolu
      // YOXDUR; gizli URL qoruma sayılmır — data yalnız bu yoxlamadan keçənə verilir.
      let isAdmin = false;
      const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      const owner = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
      if (bearer && owner) {
        try {
          const dec = await admin.auth().verifyIdToken(bearer);
          if (dec.email && dec.email.toLowerCase() === owner) isAdmin = true;
        } catch (e) { /* etibarsız token → owner deyil */ }
      }
      if (isAdmin) {
        const q = await db.collection('founding_members').orderBy('number').get();
        // Hər üzvün REAL planı/statusu entitlements-dən (server mənbəli)
        const refs = q.docs.map(d => db.doc('entitlements/' + (d.data().uid || d.id)));
        const ents = refs.length ? await db.getAll(...refs) : [];
        base.members = q.docs.map((d, i) => {
          const m = d.data();
          const e = (ents[i] && ents[i].exists) ? ents[i].data() : null;
          const plan = (e && e.plan) || 'free';
          const status = (e && e.source === 'founding') ? 'Founding üzvü'
                        : (plan !== 'free' ? 'Ödənişli üzv' : 'Aktiv');
          return { number: m.number, name: m.name || '', email: m.email || '',
                   date: m.date || 0, plan: plan, status: status };
        });
      }
      return res.status(200).json(base);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'GET/POST only' });
    const { idToken, name } = req.body || {};
    if (!idToken) return res.status(400).json({ error: 'idToken tələb olunur' });
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const memberRef = db.doc('founding_members/' + uid);
    const entRef = db.doc('entitlements/' + uid);

    const result = await db.runTransaction(async (tx) => {
      const [cSnap, mSnap] = await Promise.all([tx.get(counterRef), tx.get(memberRef)]);
      if (mSnap.exists) return { number: mSnap.data().number, count: (cSnap.exists && cSnap.data().count) || 0, existing: true };
      const count = (cSnap.exists && cSnap.data().count) || 0;
      if (count >= 100) return { closed: true, count: 100 };
      const number = count + 1;
      tx.set(memberRef, { number, name: String(name || '').slice(0, 80), email: decoded.email || '', date: Date.now(), uid });
      tx.set(counterRef, { count: number }, { merge: true });
      // ↓ FOUNDING PERK QAYDASI — dəyişmək istəsəniz yalnız bu sətri redaktə edin
      tx.set(entRef, { plan: 'premium', source: 'founding', expiryTimeMillis: null, updatedAt: Date.now() }, { merge: true });
      return { number, count: number };
    });
    return res.status(200).json(result);
  } catch (e) {
    console.error('[founding]', e.message);
    return res.status(400).json({ error: 'sorğu emal olunmadı' });
  }
};
