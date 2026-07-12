// NeuroCode — minimum təhlükəsiz aktivlik-tracking
// Auth-lu istifadəçinin ÖZ aktivliyi activity/{uid}-ə yazılır (yalnız server).
// PII minimal: ad+email (profil üçün), say-göstəriciləri. Secret yoxdur.
const admin = require('firebase-admin');
function initAdmin(){ if(admin.apps.length)return admin.app();
  const sa=process.env.FIREBASE_SERVICE_ACCOUNT; if(!sa)return null;
  return admin.initializeApp({credential:admin.credential.cert(JSON.parse(sa))}); }

module.exports = async (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  try{
    if(!initAdmin())return res.status(501).json({error:'FIREBASE_SERVICE_ACCOUNT yoxdur'});
    const bearer=(req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
    const dec=await admin.auth().verifyIdToken(bearer); // yalnız öz hesabı üçün
    const b=req.body||{};
    const ref=admin.firestore().doc('activity/'+dec.uid);
    const inc=admin.firestore.FieldValue.increment;
    const upd={ email:dec.email||'', lastSeen:Date.now(), updatedAt:Date.now() };
    if(typeof b.name==='string'&&b.name.trim())upd.name=String(b.name).slice(0,80);
    if(typeof b.role==='string'&&b.role.trim())upd.role=String(b.role).slice(0,20);
    if(typeof b.roleDetail==='string'&&b.roleDetail.trim())upd.roleDetail=String(b.roleDetail).slice(0,40);
    if(b.event==='login'){ upd.logins=inc(1); }
    if(b.event==='quiz_start'){ upd.testsStarted=inc(1); }
    if(b.event==='quiz_done'){
      upd.testsCompleted=inc(1);
      upd.qAnswered=inc(Math.max(0,Math.min(200,parseInt(b.total)||0)));
      upd.qCorrect=inc(Math.max(0,Math.min(200,parseInt(b.correct)||0)));
      upd.qWrong=inc(Math.max(0,Math.min(200,parseInt(b.wrong)||0)));
      if(typeof b.center==='string'&&b.center)upd.centers=admin.firestore.FieldValue.arrayUnion(String(b.center).slice(0,24));
    }
    if(typeof b.errorDnaTop==='string'&&b.errorDnaTop)upd.errorDnaTop=String(b.errorDnaTop).slice(0,60);
    await ref.set({createdAt:Date.now()},{merge:true}); // ilk dəfə üçün
    await ref.set(upd,{merge:true});
    return res.status(200).json({ok:true});
  }catch(e){ return res.status(401).json({error:'token etibarsızdır'}); }
};
