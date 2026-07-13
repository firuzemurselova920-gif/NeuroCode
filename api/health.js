const admin = require("firebase-admin");

function initFirebase() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT yoxdur");
  }

  return admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccount))
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Yalnız GET sorğusu qəbul edilir"
    });
  }

  const checks = {
    firebaseServiceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
    geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
    ownerEmail: Boolean(process.env.OWNER_EMAIL),
    firebaseConnection: false
  };

  try {
    initFirebase();

    await admin.auth().listUsers(1);
    checks.firebaseConnection = true;

    const allOk =
      checks.firebaseServiceAccount &&
      checks.geminiApiKey &&
      checks.ownerEmail &&
      checks.firebaseConnection;

    return res.status(allOk ? 200 : 503).json({
      ok: allOk,
      status: allOk ? "healthy" : "configuration_error",
      checks
    });
  } catch (error) {
    console.error("[health]", error);

    return res.status(500).json({
      ok: false,
      status: "backend_error",
      checks,
      error: error.message
    });
  }
};
