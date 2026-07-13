// NeuroCode — Payriff sifariş yaratma (GƏLƏCƏK İNTEQRASİYA — hazırda 501)
// Env (aktivləşəndə): PAYRIFF_SECRET_KEY, PAYRIFF_MERCHANT_ID
// Axın (hazır struktur): client plan seçir → bu endpoint Payriff API-də
// order yaradır (server-to-server, secret yalnız burada) → ödəniş URL-i
// qaytarır → istifadəçi Payriff-in RƏSMİ səhifəsində kartını daxil edir →
// payriff-callback təsdiqi Firestore entitlement-ə yazır.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!process.env.PAYRIFF_SECRET_KEY || !process.env.PAYRIFF_MERCHANT_ID)
    return res.status(501).json({ error: 'Payriff hələ konfiqurasiya edilməyib' });
  // TODO (inteqrasiya günü): https://api.payriff.com/api/v3/orders
  return res.status(501).json({ error: 'Payriff inteqrasiyası növbəti mərhələdədir' });
};
