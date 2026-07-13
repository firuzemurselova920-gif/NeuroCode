const admin = require("firebase-admin");

function initFirebase() {
  if (admin.apps.length) return admin.app();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT yoxdur");

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT JSON formatı yanlışdır");
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Yalnız GET sorğusu qəbul edilir",
    });
  }

  const report = {
    system: "NeuroCode System Check",
    timestamp: new Date().toISOString(),

    environment: {
      firebaseServiceAccount: Boolean(
        process.env.FIREBASE_SERVICE_ACCOUNT
      ),
      geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
      ownerEmail: Boolean(process.env.OWNER_EMAIL),
    },

    services: {
      firebaseInitialization: false,
      firebaseAuth: false,
      firestore: false,
      geminiConfiguration: false,
      adminConfiguration: false,
    },

    problems: [],
  };

  try {
    initFirebase();
    report.services.firebaseInitialization = true;

    try {
      await admin.auth().listUsers(1);
      report.services.firebaseAuth = true;
    } catch (error) {
      report.problems.push(
        "Firebase Auth işləmir: " + error.message
      );
    }

    try {
      await admin
        .firestore()
        .collection("_system_check")
        .limit(1)
        .get();

      report.services.firestore = true;
    } catch (error) {
      report.problems.push(
        "Firestore bağlantısı işləmir: " + error.message
      );
    }

    if (process.env.GEMINI_API_KEY) {
      report.services.geminiConfiguration = true;
    } else {
      report.problems.push("GEMINI_API_KEY tapılmadı");
    }

    if (process.env.OWNER_EMAIL) {
      report.services.adminConfiguration = true;
    } else {
      report.problems.push("OWNER_EMAIL tapılmadı");
    }

    const allHealthy =
      report.services.firebaseInitialization &&
      report.services.firebaseAuth &&
      report.services.firestore &&
      report.services.geminiConfiguration &&
      report.services.adminConfiguration;

    report.ok = allHealthy;
    report.status = allHealthy
      ? "SYSTEM_HEALTHY"
      : "SYSTEM_HAS_PROBLEMS";

    return res.status(allHealthy ? 200 : 503).json(report);
  } catch (error) {
    report.ok = false;
    report.status = "CRITICAL_ERROR";
    report.problems.push(error.message);

    console.error("[SYSTEM CHECK]", error);

    return res.status(500).json(report);
  }
};
