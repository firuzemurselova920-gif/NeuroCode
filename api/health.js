const admin = require("firebase-admin");

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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      status: "method_not_allowed",
      error: "Yalnız GET sorğusu qəbul edilir"
    });
  }

  const checks = {
    firebaseServiceAccount: false,
    geminiApiKey: false,
    ownerEmail: false,
    firebaseConnection: false,
    firestoreConnection: false,
    aiConfiguration: false,
    adminConfiguration: false
  };

  try {
    checks.firebaseServiceAccount =
      Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);

    checks.geminiApiKey =
      Boolean(process.env.GEMINI_API_KEY);

    checks.ownerEmail =
      Boolean(process.env.OWNER_EMAIL);

    /*
    ==============================
    FIREBASE INIT
    ==============================
    */

    initFirebase();

    /*
    ==============================
    FIREBASE AUTH TEST
    ==============================
    */

    try {
      await admin.auth().listUsers(1);

      checks.firebaseConnection = true;
    } catch (error) {
      console.error(
        "[HEALTH FIREBASE AUTH ERROR]",
        error.message
      );

      checks.firebaseConnection = false;
    }

    /*
    ==============================
    FIRESTORE TEST
    ==============================
    */

    try {
      const db = admin.firestore();

      await db
        .collection("entitlements")
        .limit(1)
        .get();

      checks.firestoreConnection = true;
    } catch (error) {
      console.error(
        "[HEALTH FIRESTORE ERROR]",
        error.message
      );

      checks.firestoreConnection = false;
    }

    /*
    ==============================
    AI CONFIGURATION
    ==============================
    */

    checks.aiConfiguration =
      checks.geminiApiKey;

    /*
    ==============================
    ADMIN CONFIGURATION
    ==============================
    */

    checks.adminConfiguration =
      checks.ownerEmail &&
      checks.firebaseServiceAccount &&
      checks.firebaseConnection &&
      checks.firestoreConnection;

    /*
    ==============================
    FINAL STATUS
    ==============================
    */

    const allOk =
      checks.firebaseServiceAccount &&
      checks.geminiApiKey &&
      checks.ownerEmail &&
      checks.firebaseConnection &&
      checks.firestoreConnection &&
      checks.aiConfiguration &&
      checks.adminConfiguration;

    return res
      .status(allOk ? 200 : 503)
      .json({
        ok: allOk,

        status: allOk
          ? "healthy"
          : "configuration_error",

        services: {
          aiTeacher:
            checks.aiConfiguration
              ? "ready"
              : "not_configured",

          adminPanel:
            checks.adminConfiguration
              ? "ready"
              : "not_configured",

          firebaseAuth:
            checks.firebaseConnection
              ? "connected"
              : "disconnected",

          firestore:
            checks.firestoreConnection
              ? "connected"
              : "disconnected"
        },

        checks
      });

  } catch (error) {
    console.error(
      "[HEALTH ERROR]",
      error
    );

    return res.status(500).json({
      ok: false,
      status: "backend_error",
      services: {
        aiTeacher: "unknown",
        adminPanel: "unknown",
        firebaseAuth: "disconnected",
        firestore: "disconnected"
      },
      checks,
      error:
        error?.message ||
        "Backend health check xətası"
    });
  }
};
