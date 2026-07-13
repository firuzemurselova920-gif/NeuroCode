const admin = require("firebase-admin");

const TRIAL_MS = 72 * 60 * 60 * 1000;

function initFirebase() {
  if (admin.apps.length) {
    return admin.app();
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT yoxdur");
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(raw);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT JSON formatı yanlışdır");
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Yalnız POST sorğusu qəbul edilir"
    });
  }

  try {
    initFirebase();

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const idToken = String(body.idToken || "").trim();

    if (!idToken) {
      return res.status(401).json({
        ok: false,
        plan: "free",
        status: "unauthenticated",
        error: "idToken yoxdur"
      });
    }

    let decoded;

    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({
        ok: false,
        plan: "free",
        status: "unauthenticated",
        error: "Firebase token etibarsızdır"
      });
    }

    const uid = decoded.uid;

    const db = admin.firestore();

    const [entitlementSnapshot, userRecord] =
      await Promise.all([
        db.doc(`entitlements/${uid}`).get(),
        admin.auth().getUser(uid)
      ]);

    const entitlement =
      entitlementSnapshot.exists
        ? entitlementSnapshot.data()
        : {};

    const plan =
      String(entitlement?.plan || "free").toLowerCase();

    /*
    ==============================
    BLOKLANMIŞ İSTİFADƏÇİ
    ==============================
    */

    if (plan === "blocked") {
      return res.status(200).json({
        ok: true,
        plan: "blocked",
        status: "blocked",
        access: false,
        trialRemaining: 0
      });
    }

    /*
    ==============================
    ADMIN TƏRƏFİNDƏN AKTİV EDİLİB
    ==============================
    */

    if (
      plan === "active" ||
      plan === "premium" ||
      plan === "go"
    ) {
      return res.status(200).json({
        ok: true,
        plan,
        status: "active",
        access: true,
        trialRemaining: null
      });
    }

    /*
    ==============================
    72 SAATLIQ TRIAL
    ==============================
    */

    const createdAt =
      userRecord.metadata?.creationTime
        ? Date.parse(userRecord.metadata.creationTime)
        : 0;

    if (!createdAt) {
      return res.status(200).json({
        ok: true,
        plan: "free",
        status: "trial",
        access: true,
        trialRemaining: TRIAL_MS
      });
    }

    const now = Date.now();

    const trialEnd =
      createdAt + TRIAL_MS;

    const trialRemaining =
      Math.max(0, trialEnd - now);

    /*
    ==============================
    TRIAL BİTİB
    ==============================
    */

    if (trialRemaining <= 0) {
      return res.status(200).json({
        ok: true,
        plan: "free",
        status: "trial_expired",
        access: false,
        trialRemaining: 0,
        trialEnd
      });
    }

    /*
    ==============================
    TRIAL DAVAM EDİR
    ==============================
    */

    return res.status(200).json({
      ok: true,
      plan: "free",
      status: "trial",
      access: true,
      trialRemaining,
      trialEnd
    });

  } catch (error) {
    console.error(
      "[ENTITLEMENT ERROR]",
      error
    );

    return res.status(500).json({
      ok: false,
      plan: "free",
      status: "error",
      access: false,
      error:
        error?.message ||
        "Entitlement server xətası"
    });
  }
};
