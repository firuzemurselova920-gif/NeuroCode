// NeuroCode — Payriff callback/webhook (GƏLƏCƏK İNTEQRASİYA — hazırda 501)
// Aktivləşəndə: imza yoxlaması (PAYRIFF_SECRET_KEY ilə) → status APPROVED
// olduqda Firestore entitlements/{uid} yazılır (paddle-webhook.js nümunəsi ilə
// eyni prinsip: Premium YALNIZ server təsdiqi ilə).
module.exports = async (req, res) => {
  if (!process.env.PAYRIFF_SECRET_KEY)
    return res.status(501).json({ error: 'Payriff hələ konfiqurasiya edilməyib' });
  return res.status(501).json({ error: 'Payriff inteqrasiyası növbəti mərhələdədir' });
};
