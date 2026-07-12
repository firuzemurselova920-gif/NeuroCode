// NeuroCode — ADMIN PANEL API (YALNIZ OWNER; server-side yoxlama)
// Modes: ?mode=stats | ?mode=list[&pageToken=][&search=email] | ?mode=detail&uid=
// Mənbələr (hamısı REAL): Firebase Auth (email, yaradılma, son giriş),
// Firestore entitlements (plan), founding_members (№/ad), activity (tracking).
const admin = require('firebase-admin');
function initAdmin(){ if(admin.apps.length)return admin.app();
  const sa=process.env.FIREBASE_SERVICE_ACCOUNT; if(!sa)return null;
  return admin.initializeApp({credential:admin.credential.cert(JSON.parse(sa))}); }

async function requireOwner(req){
  const bearer=(req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
  const owner=String(process.env.OWNER_EMAIL||'').trim().toLowerCase();
  if(!bearer||!owner)return null;
  try{ const d=await admin.auth().verifyIdToken(bearer);
    return (d.email&&d.email.toLowerCase()===owner)?d:null; }catch(e){ return null; }
}
function mergeRow(u, ent, act, fnd){
  const plan=(ent&&ent.plan)||'free';
  const status=fnd?('Founding #'+fnd.number):(plan!=='free'?'Ödənişli':'Beta/Pulsuz');
  return { uid:u.uid, email:u.email||'',
    name:(act&&act.name)||(fnd&&fnd.name)||'',
    created:u.metadata&&u.metadata.creationTime?Date.parse(u.metadata.creationTime):null,
    lastLogin:u.metadata&&u.metadata.lastSignInTime?Date.parse(u.metadata.lastSignInTime):null,
    lastSeen:(act&&act.lastSeen)||null, plan, status,
    testsStarted:(act&&act.testsStarted)||0, testsCompleted:(act&&act.testsCompleted)||0,
    qAnswered:(act&&act.qAnswered)||0, qCorrect:(act&&act.qCorrect)||0, qWrong:(act&&act.qWrong)||0,
    centers:(act&&act.centers)||[], errorDnaTop:(act&&act.errorDnaTop)||null,
    progress:(act&&act.qAnswered)?Math.round(100*((act.qCorrect||0)/act.qAnswered)):null };
}
async function attach(db, users){
  const gets=[]; users.forEach(u=>{ gets.push(db.doc('entitlements/'+u.uid), db.doc('activity/'+u.uid), db.doc('founding_members/'+u.uid)); });
  const snaps=gets.length?await db.getAll(...gets):[];
  return users.map((u,i)=>{ const e=snaps[i*3], a=snaps[i*3+1], f=snaps[i*3+2];
    return mergeRow(u, e&&e.exists?e.data():null, a&&a.exists?a.data():null, f&&f.exists?f.data():null); });
}

module.exports = async (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();
  try{
    if(!initAdmin())return res.status(501).json({error:'FIREBASE_SERVICE_ACCOUNT yoxdur'});
    const dec=await requireOwner(req);
    if(!dec)return res.status(403).json({error:'yalnız owner'}); // adi istifadəçi HEÇ NƏ almır
    const db=admin.firestore();
    const q=req.query||{};
    const mode=q.mode||'list';

    if(mode==='detail'&&q.uid){
      const u=await admin.auth().getUser(String(q.uid));
      const rows=await attach(db,[u]);
      return res.status(200).json({user:rows[0]});
    }
    if(mode==='list'){
      if(q.search){ // dəqiq e-mail axtarışı (indekssiz, sürətli)
        try{ const u=await admin.auth().getUserByEmail(String(q.search).trim().toLowerCase());
          const rows=await attach(db,[u]);
          return res.status(200).json({users:rows,nextPageToken:null,searched:true});
        }catch(e){ return res.status(200).json({users:[],nextPageToken:null,searched:true}); }
      }
      const page=await admin.auth().listUsers(50, q.pageToken?String(q.pageToken):undefined); // pagination — minlərlə istifadəçiyə uyğun
      const rows=await attach(db,page.users);
      return res.status(200).json({users:rows,nextPageToken:page.pageToken||null});
    }
    if(mode==='stats'){
      // Auth: cəm + yeni (7 gün) — səhifə-səhifə skan (≤ bir neçə min üçün münasib)
      let total=0,newest7=0,tok=undefined; const weekAgo=Date.now()-7*864e5;
      do{ const p=await admin.auth().listUsers(1000,tok);
        total+=p.users.length;
        p.users.forEach(u=>{ if(u.metadata&&u.metadata.creationTime&&Date.parse(u.metadata.creationTime)>weekAgo)newest7++; });
        tok=p.pageToken; }while(tok);
      // Firestore aqreqatları (count() — böyük həcmdə də səmərəli)
      const cnt=async(qq)=>{ const s=await qq.count().get(); return s.data().count; };
      const paid=await cnt(db.collection('entitlements').where('plan','in',['go','premium']));
      const anyActivity=await cnt(db.collection('activity'));
      const solvers=await cnt(db.collection('activity').where('qAnswered','>',0));
      const active7=await cnt(db.collection('activity').where('lastSeen','>',weekAgo));
      const testsAgg=await db.collection('activity').aggregate({
        tests:admin.firestore.AggregateField.sum('testsCompleted'),
        qAns:admin.firestore.AggregateField.sum('qAnswered'),
        qCor:admin.firestore.AggregateField.sum('qCorrect')
      }).get();
      const t=testsAgg.data();
      return res.status(200).json({ totalUsers:total, newLast7Days:newest7,
        paidUsers:paid, freeUsers:Math.max(0,total-paid),
        activeLast7Days:active7, passiveUsers:Math.max(0,total-active7),
        usersWhoSolved:solvers, usersWhoNeverSolved:Math.max(0,total-solvers),
        trackedUsers:anyActivity, totalTestsCompleted:t.tests||0,
        totalQuestionsAnswered:t.qAns||0, totalCorrect:t.qCor||0 });
    }
    return res.status(400).json({error:'mode yanlışdır'});
  }catch(e){ console.error('[admin-users]',e.message); return res.status(400).json({error:'emal olunmadı'}); }
};
