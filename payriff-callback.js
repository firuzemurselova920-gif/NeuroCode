const admin = require('firebase-admin');
const TL=5, AL=15;
function init(){if(admin.apps.length)return admin.app();
const sa=process.env.FIREBASE_SERVICE_ACCOUNT;if(!sa)return null;
return admin.initializeApp({credential:admin.credential.cert(JSON.parse(sa))});}
module.exports=async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'POST'});
  try{
    if(!init())return res.json({plan:'free',status:'free',testsUsed:0,aiUsed:0,testsLimit:TL,aiLimit:AL});
    const{idToken}=req.body||{};if(!idToken)return res.json({plan:'free',status:'free'});
    const d=await admin.auth().verifyIdToken(idToken),db=admin.firestore();
    const[eS,aS]=await Promise.all([db.doc('entitlements/'+d.uid).get(),db.doc('activity/'+d.uid).get()]);
    const ent=eS.exists?eS.data():{},act=aS.exists?aS.data():{};
    const plan=ent.plan||'free',tU=act.testsCompleted||0,aU=act.aiMessages||0;
    const b={testsUsed:tU,aiUsed:aU,testsLimit:TL,aiLimit:AL};
    if(plan==='blocked')return res.json({plan:'blocked',status:'blocked',...b});
    if(plan==='active'||plan==='premium'||plan==='go')return res.json({plan,status:'active',...b});
    if(tU>=TL||aU>=AL)return res.json({plan:'free',status:'limit_reached',...b});
    return res.json({plan:'free',status:'free',...b});
  }catch(e){return res.status(401).json({plan:'free',status:'free'});}
};
