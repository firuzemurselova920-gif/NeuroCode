const admin = require('firebase-admin');
const TRIAL_MS = 72 * 60 * 60 * 1000;
function init() { if (admin.apps.length) return admin.app(); const sa = process.env.FIREBASE_SERVICE_ACCOUNT; if (!sa) return null; return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) }); }
async function requireOwner(req) {
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const owner = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (!bearer || !owner) return null;
  try { const d = await admin.auth().verifyIdToken(bearer); return (d.email && d.email.toLowerCase() === owner) ? d : null; } catch (e) { return null; }
}
function mergeRow(u, ent, act, fnd) {
  const plan = (ent && ent.plan) || 'free';
  const created = u.metadata?.creationTime ? Date.parse(u.metadata.creationTime) : 0;
  const elapsed = created ? Date.now() - created : 0;
  let limitStatus = 'FREE';
  if (plan === 'blocked') limitStatus = 'BLOCKED';
  else if (plan === 'active' || plan === 'premium' || plan === 'go' || fnd) limitStatus = 'ACTIVE';
  else if (created && elapsed > TRIAL_MS) limitStatus = 'TRIAL_EXPIRED';
  else limitStatus = 'TRIAL';
  const trialEnd = created ? created + TRIAL_MS : 0;
  const trialRemaining = Math.max(0, trialEnd - Date.now());
  return {
    uid: u.uid, email: u.email || '',
    name: (act && act.name) || (fnd && fnd.name) || '',
    role: (act && act.role) || '', roleDetail: (act && act.roleDetail) || '',
    created, lastLogin: u.metadata?.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : null,
    lastSeen: (act && act.lastSeen) || null, plan,
    status: fnd ? ('Founding #' + fnd.number) : (limitStatus === 'ACTIVE' ? 'Ödənişli' : limitStatus === 'TRIAL' ? 'Trial' : limitStatus === 'TRIAL_EXPIRED' ? 'Trial Bitib' : limitStatus === 'BLOCKED' ? 'Bloklanıb' : 'Pulsuz'),
    limitStatus, trialEnd, trialRemaining,
    testsStarted: (act && act.testsStarted) || 0, testsCompleted: (act && act.testsCompleted) || 0,
    aiMessages: (act && act.aiMessages) || 0,
    qAnswered: (act && act.qAnswered) || 0, qCorrect: (act && act.qCorrect) || 0, qWrong: (act && act.qWrong) || 0,
    centers: (act && act.centers) || [], errorDnaTop: (act && act.errorDnaTop) || null
  };
}
async function attach(db, users) {
  const gets = []; users.forEach(u => { gets.push(db.doc('entitlements/' + u.uid), db.doc('activity/' + u.uid), db.doc('founding_members/' + u.uid)); });
  const snaps = gets.length ? await db.getAll(...gets) : [];
  return users.map((u, i) => { const e = snaps[i * 3], a = snaps[i * 3 + 1], f = snaps[i * 3 + 2]; return mergeRow(u, e?.exists ? e.data() : null, a?.exists ? a.data() : null, f?.exists ? f.data() : null); });
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (!init()) return res.status(501).json({ error: 'FIREBASE_SERVICE_ACCOUNT yoxdur' });
    const dec = await requireOwner(req);
    if (!dec) return res.status(403).json({ error: 'yalnız owner' });
    const db = admin.firestore();
    const q = req.query || {};
    const mode = q.mode || 'list';
    // ACTIVATE
    if (mode === 'activate' && q.uid) {
      await db.doc('entitlements/' + String(q.uid)).set({ plan: 'active', activatedAt: Date.now(), activatedBy: dec.email }, { merge: true });
      return res.json({ ok: true, action: 'activate' });
    }
    // BLOCK
    if (mode === 'block' && q.uid) {
      await db.doc('entitlements/' + String(q.uid)).set({ plan: 'blocked', blockedAt: Date.now() }, { merge: true });
      return res.json({ ok: true, action: 'block' });
    }
    // DEACTIVATE / UNBLOCK
    if (mode === 'deactivate' && q.uid) {
      await db.doc('entitlements/' + String(q.uid)).set({ plan: 'free', deactivatedAt: Date.now() }, { merge: true });
      return res.json({ ok: true, action: 'deactivate' });
    }
    // EXTEND TRIAL (+72h from now)
    if (mode === 'extend' && q.uid) {
      // Reset creation time is not possible via Admin SDK, so we use entitlements to grant active
      await db.doc('entitlements/' + String(q.uid)).set({ plan: 'active', extendedAt: Date.now(), extendedBy: dec.email }, { merge: true });
      return res.json({ ok: true, action: 'extend' });
    }
    // DETAIL
    if (mode === 'detail' && q.uid) {
      const u = await admin.auth().getUser(String(q.uid));
      const rows = await attach(db, [u]);
      return res.json({ user: rows[0] });
    }
    // LIST
    if (mode === 'list') {
      if (q.search) {
        try { const u = await admin.auth().getUserByEmail(String(q.search).trim().toLowerCase()); const rows = await attach(db, [u]); return res.json({ users: rows, nextPageToken: null }); }
        catch (e) { return res.json({ users: [], nextPageToken: null }); }
      }
      const page = await admin.auth().listUsers(50, q.pageToken ? String(q.pageToken) : undefined);
      const rows = await attach(db, page.users);
      return res.json({ users: rows, nextPageToken: page.pageToken || null });
    }
    // STATS
    if (mode === 'stats') {
      let total = 0, newest7 = 0, newestToday = 0, tok = undefined;
      const weekAgo = Date.now() - 7 * 864e5;
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0); const todayMs = todayStart.getTime();
      const allUsers = [];
      do {
        const p = await admin.auth().listUsers(1000, tok);
        total += p.users.length;
        p.users.forEach(u => {
          allUsers.push(u);
          const ct = u.metadata?.creationTime ? Date.parse(u.metadata.creationTime) : 0;
          if (ct > weekAgo) newest7++;
          if (ct > todayMs) newestToday++;
        });
        tok = p.pageToken;
      } while (tok);
      // Count by status
      let trialCount = 0, expiredCount = 0;
      allUsers.forEach(u => {
        const ct = u.metadata?.creationTime ? Date.parse(u.metadata.creationTime) : 0;
        const elapsed = ct ? Date.now() - ct : 0;
        if (elapsed <= TRIAL_MS) trialCount++; else expiredCount++;
      });
      const cnt = async (qq) => { const s = await qq.count().get(); return s.data().count; };
      let paid = 0, blocked = 0, active = 0;
      try { paid = await cnt(db.collection('entitlements').where('plan', 'in', ['active', 'go', 'premium'])); } catch (e) {}
      try { blocked = await cnt(db.collection('entitlements').where('plan', '==', 'blocked')); } catch (e) {}
      try { active = await cnt(db.collection('activity').where('lastSeen', '>', weekAgo)); } catch (e) {}
      let totalTests = 0, totalQ = 0, totalCorrect = 0, totalAI = 0;
      try {
        const agg = await db.collection('activity').aggregate({
          tests: admin.firestore.AggregateField.sum('testsCompleted'),
          qAns: admin.firestore.AggregateField.sum('qAnswered'),
          qCor: admin.firestore.AggregateField.sum('qCorrect'),
          ai: admin.firestore.AggregateField.sum('aiMessages')
        }).get();
        const t = agg.data();
        totalTests = t.tests || 0; totalQ = t.qAns || 0; totalCorrect = t.qCor || 0; totalAI = t.ai || 0;
      } catch (e) {}
      return res.json({
        totalUsers: total, newToday: newestToday, newLast7Days: newest7,
        activeLast7Days: active, paidUsers: paid, blockedUsers: blocked,
        trialUsers: trialCount, trialExpiredUsers: Math.max(0, expiredCount - paid - blocked),
        freeUsers: Math.max(0, total - paid - blocked),
        totalTestsCompleted: totalTests, totalQuestionsAnswered: totalQ,
        totalCorrect, totalAIMessages: totalAI
      });
    }
    return res.status(400).json({ error: 'mode yanlışdır' });
  } catch (e) { console.error('[admin-users]', e.message); return res.status(400).json({ error: e.message }); }
};
