const admin = require("firebase-admin");

function initFirebase() {
  if (admin.apps.length) return admin.app();

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

function safeText(value, maxLength) {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .slice(0, maxLength);
}

function safeNumber(value, max = 200) {
  const number = Number.parseInt(value, 10);

  if (!Number.isFinite(number)) return 0;

  return Math.max(
    0,
    Math.min(max, number)
  );
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
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

    const authorization = String(
      req.headers.authorization || ""
    ).trim();

    const idToken = authorization.replace(
      /^Bearer\s+/i,
      ""
    );

    if (!idToken) {
      return res.status(401).json({
        ok: false,
        error: "Firebase token göndərilməyib"
      });
    }

    let decoded;

    try {
      decoded = await admin
        .auth()
        .verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({
        ok: false,
        error: "Firebase token etibarsızdır"
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const event = safeText(
      body.event,
      40
    );

    const uid = decoded.uid;

    const db = admin.firestore();

    const activityRef = db.doc(
      `activity/${uid}`
    );

    const increment =
      admin.firestore.FieldValue.increment;

    const arrayUnion =
      admin.firestore.FieldValue.arrayUnion;

    const now = Date.now();

    /*
    ==========================================
    ƏSAS İSTİFADƏÇİ MƏLUMATLARI
    ==========================================
    */

    const update = {
      uid,

      email:
        decoded.email || "",

      lastSeen: now,

      updatedAt: now
    };

    const name =
      safeText(body.name, 80);

    const role =
      safeText(body.role, 20);

    const roleDetail =
      safeText(body.roleDetail, 80);

    if (name) {
      update.name = name;
    } else if (decoded.name) {
      update.name =
        safeText(decoded.name, 80);
    }

    if (role) {
      update.role = role;
    }

    if (roleDetail) {
      update.roleDetail = roleDetail;
    }

    /*
    ==========================================
    QEYDİYYAT
    ==========================================
    */

    if (event === "register") {
      update.registeredAt = now;

      update.registrationCompleted = true;

      update.accountStatus = "registered";
    }

    /*
    ==========================================
    LOGIN
    ==========================================
    */

    if (event === "login") {
      update.logins =
        increment(1);

      update.lastLoginAt = now;
    }

    /*
    ==========================================
    TEST BAŞLADI
    ==========================================
    */

    if (event === "quiz_start") {
      update.testsStarted =
        increment(1);
    }

    /*
    ==========================================
    TEST BİTDİ
    ==========================================
    */

    if (event === "quiz_done") {
      const total =
        safeNumber(body.total);

      const correct =
        safeNumber(body.correct);

      const wrong =
        safeNumber(body.wrong);

      update.testsCompleted =
        increment(1);

      update.qAnswered =
        increment(total);

      update.qCorrect =
        increment(correct);

      update.qWrong =
        increment(wrong);

      const center =
        safeText(body.center, 40);

      if (center) {
        update.centers =
          arrayUnion(center);
      }
    }

    /*
    ==========================================
    AI MÜƏLLİM MESAJI
    ==========================================
    */

    if (event === "ai_message") {
      update.aiMessages =
        increment(1);

      update.lastAIMessageAt =
        now;
    }

    /*
    ==========================================
    ERROR DNA
    ==========================================
    */

    const errorDnaTop =
      safeText(
        body.errorDnaTop,
        60
      );

    if (errorDnaTop) {
      update.errorDnaTop =
        errorDnaTop;
    }

    /*
    ==========================================
    İLK DƏFƏ ACTIVITY SƏNƏDİ YARAT
    ==========================================
    */

    const snapshot =
      await activityRef.get();

    if (!snapshot.exists) {
      update.createdAt = now;
    }

    /*
    ==========================================
    FIRESTORE-A YAZ
    ==========================================
    */

    await activityRef.set(
      update,
      {
        merge: true
      }
    );

    return res.status(200).json({
      ok: true,
      uid,
      event:
        event || "activity_update"
    });

  } catch (error) {
    console.error(
      "[TRACK ERROR]",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Aktivlik server xətası"
    });
  }
};
