const admin = require("firebase-admin");

const TRIAL_MS = 72 * 60 * 60 * 1000;

/* =========================
   FIREBASE INIT
========================= */

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


/* =========================
   ADMIN YOXLAMASI
========================= */

async function requireOwner(req) {
  const authHeader = String(
    req.headers.authorization || ""
  ).trim();

  const token = authHeader.replace(
    /^Bearer\s+/i,
    ""
  );

  if (!token) {
    throw new Error("AUTH_TOKEN_MISSING");
  }

  const ownerEmail = String(
    process.env.OWNER_EMAIL || ""
  )
    .trim()
    .toLowerCase();

  if (!ownerEmail) {
    throw new Error("OWNER_EMAIL_MISSING");
  }

  let decoded;

  try {
    decoded = await admin
      .auth()
      .verifyIdToken(token);
  } catch (error) {
    throw new Error("INVALID_AUTH_TOKEN");
  }

  const email = String(
    decoded.email || ""
  )
    .trim()
    .toLowerCase();

  if (email !== ownerEmail) {
    throw new Error("NOT_OWNER");
  }

  return decoded;
}


/* =========================
   USER STATUS
========================= */

function calculateStatus(
  user,
  entitlement,
  founding
) {
  const plan =
    entitlement?.plan || "free";

  if (plan === "blocked") {
    return "BLOCKED";
  }

  if (
    plan === "active" ||
    plan === "premium" ||
    plan === "go" ||
    founding
  ) {
    return "ACTIVE";
  }

  const created =
    user.metadata?.creationTime
      ? Date.parse(
          user.metadata.creationTime
        )
      : 0;

  if (!created) {
    return "TRIAL";
  }

  const elapsed =
    Date.now() - created;

  if (elapsed >= TRIAL_MS) {
    return "TRIAL_EXPIRED";
  }

  return "TRIAL";
}


/* =========================
   USER ROW
========================= */

function createUserRow(
  user,
  entitlement,
  activity,
  founding
) {
  const created =
    user.metadata?.creationTime
      ? Date.parse(
          user.metadata.creationTime
        )
      : 0;

  const lastLogin =
    user.metadata?.lastSignInTime
      ? Date.parse(
          user.metadata.lastSignInTime
        )
      : null;

  const limitStatus =
    calculateStatus(
      user,
      entitlement,
      founding
    );

  const trialEnd =
    created
      ? created + TRIAL_MS
      : 0;

  const trialRemaining =
    trialEnd
      ? Math.max(
          0,
          trialEnd - Date.now()
        )
      : 0;

  const statusText = {
    ACTIVE: "Aktiv",
    TRIAL: "Trial",
    TRIAL_EXPIRED: "Trial bitib",
    BLOCKED: "Bloklanıb"
  };

  return {
    uid: user.uid,

    email:
      user.email || "",

    name:
      activity?.name ||
      founding?.name ||
      user.displayName ||
      "",

    role:
      activity?.role ||
      "student",

    roleDetail:
      activity?.roleDetail ||
      "",

    created,

    lastLogin,

    lastSeen:
      activity?.lastSeen ||
      null,

    plan:
      entitlement?.plan ||
      "free",

    status:
      founding
        ? `Founding #${founding.number || ""}`
        : statusText[limitStatus],

    limitStatus,

    trialEnd,

    trialRemaining,

    testsStarted:
      Number(
        activity?.testsStarted || 0
      ),

    testsCompleted:
      Number(
        activity?.testsCompleted || 0
      ),

    aiMessages:
      Number(
        activity?.aiMessages || 0
      ),

    qAnswered:
      Number(
        activity?.qAnswered || 0
      ),

    qCorrect:
      Number(
        activity?.qCorrect || 0
      ),

    qWrong:
      Number(
        activity?.qWrong || 0
      ),

    centers:
      activity?.centers || [],

    errorDnaTop:
      activity?.errorDnaTop ||
      null
  };
}


/* =========================
   FIRESTORE DATA ATTACH
========================= */

async function attachUserData(
  db,
  users
) {
  if (!users.length) {
    return [];
  }

  const refs = [];

  users.forEach(user => {
    refs.push(
      db.doc(
        `entitlements/${user.uid}`
      ),

      db.doc(
        `activity/${user.uid}`
      ),

      db.doc(
        `founding_members/${user.uid}`
      )
    );
  });

  const snapshots =
    await db.getAll(...refs);

  return users.map(
    (user, index) => {

      const entitlementSnapshot =
        snapshots[index * 3];

      const activitySnapshot =
        snapshots[index * 3 + 1];

      const foundingSnapshot =
        snapshots[index * 3 + 2];

      return createUserRow(
        user,

        entitlementSnapshot?.exists
          ? entitlementSnapshot.data()
          : null,

        activitySnapshot?.exists
          ? activitySnapshot.data()
          : null,

        foundingSnapshot?.exists
          ? foundingSnapshot.data()
          : null
      );
    }
  );
}


/* =========================
   MAIN API
========================= */

module.exports =
async function handler(req, res) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res
      .status(200)
      .end();
  }

  try {

    initFirebase();

    const owner =
      await requireOwner(req);

    const db =
      admin.firestore();

    const query =
      req.query || {};

    const mode =
      String(
        query.mode || "list"
      );

    const uid =
      query.uid
        ? String(query.uid)
        : "";


    /* =====================
       AKTİV ET
    ===================== */

    if (mode === "activate") {

      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID yoxdur"
        });
      }

      await db
        .doc(
          `entitlements/${uid}`
        )
        .set(
          {
            plan: "active",

            activatedAt:
              Date.now(),

            activatedBy:
              owner.email || ""
          },
          {
            merge: true
          }
        );

      return res.json({
        ok: true,
        action: "activate",
        uid
      });
    }


    /* =====================
       BLOKLA
    ===================== */

    if (mode === "block") {

      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID yoxdur"
        });
      }

      await db
        .doc(
          `entitlements/${uid}`
        )
        .set(
          {
            plan: "blocked",

            blockedAt:
              Date.now(),

            blockedBy:
              owner.email || ""
          },
          {
            merge: true
          }
        );

      return res.json({
        ok: true,
        action: "block",
        uid
      });
    }


    /* =====================
       BLOKDAN ÇIXAR
    ===================== */

    if (mode === "deactivate") {

      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID yoxdur"
        });
      }

      await db
        .doc(
          `entitlements/${uid}`
        )
        .set(
          {
            plan: "free",

            deactivatedAt:
              Date.now(),

            deactivatedBy:
              owner.email || ""
          },
          {
            merge: true
          }
        );

      return res.json({
        ok: true,
        action: "deactivate",
        uid
      });
    }


    /* =====================
       LİMİTİ QALDIR
    ===================== */

    if (mode === "extend") {

      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID yoxdur"
        });
      }

      await db
        .doc(
          `entitlements/${uid}`
        )
        .set(
          {
            plan: "active",

            extendedAt:
              Date.now(),

            extendedBy:
              owner.email || ""
          },
          {
            merge: true
          }
        );

      return res.json({
        ok: true,
        action: "extend",
        uid
      });
    }


    /* =====================
       USER DETAIL
    ===================== */

    if (mode === "detail") {

      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID yoxdur"
        });
      }

      const user =
        await admin
          .auth()
          .getUser(uid);

      const rows =
        await attachUserData(
          db,
          [user]
        );

      return res.json({
        ok: true,
        user: rows[0]
      });
    }


    /* =====================
       USER LIST
    ===================== */

    if (mode === "list") {

      const search =
        String(
          query.search || ""
        )
          .trim()
          .toLowerCase();

      if (search) {

        try {

          const user =
            await admin
              .auth()
              .getUserByEmail(
                search
              );

          const rows =
            await attachUserData(
              db,
              [user]
            );

          return res.json({
            ok: true,
            users: rows,
            nextPageToken: null
          });

        } catch (error) {

          return res.json({
            ok: true,
            users: [],
            nextPageToken: null
          });
        }
      }

      const page =
        await admin
          .auth()
          .listUsers(
            100,

            query.pageToken
              ? String(
                  query.pageToken
                )
              : undefined
          );

      const rows =
        await attachUserData(
          db,
          page.users
        );

      return res.json({
        ok: true,
        users: rows,

        nextPageToken:
          page.pageToken ||
          null
      });
    }


    /* =====================
       STATISTICS
    ===================== */

    if (mode === "stats") {

      let totalUsers = 0;
      let newToday = 0;
      let newLast7Days = 0;

      let trialUsers = 0;
      let trialExpiredUsers = 0;
      let paidUsers = 0;
      let blockedUsers = 0;

      let pageToken;

      const allUsers = [];

      const now =
        Date.now();

      const weekAgo =
        now -
        7 *
        24 *
        60 *
        60 *
        1000;

      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      const todayStart =
        today.getTime();


      do {

        const page =
          await admin
            .auth()
            .listUsers(
              1000,
              pageToken
            );

        allUsers.push(
          ...page.users
        );

        pageToken =
          page.pageToken;

      } while (pageToken);


      totalUsers =
        allUsers.length;


      const rows =
        await attachUserData(
          db,
          allUsers
        );


      rows.forEach(row => {

        if (
          row.created >=
          todayStart
        ) {
          newToday++;
        }

        if (
          row.created >=
          weekAgo
        ) {
          newLast7Days++;
        }

        if (
          row.limitStatus ===
          "TRIAL"
        ) {
          trialUsers++;
        }

        if (
          row.limitStatus ===
          "TRIAL_EXPIRED"
        ) {
          trialExpiredUsers++;
        }

        if (
          row.limitStatus ===
          "ACTIVE"
        ) {
          paidUsers++;
        }

        if (
          row.limitStatus ===
          "BLOCKED"
        ) {
          blockedUsers++;
        }
      });


      return res.json({
        ok: true,

        totalUsers,

        newToday,

        newLast7Days,

        trialUsers,

        trialExpiredUsers,

        paidUsers,

        blockedUsers,

        freeUsers:
          Math.max(
            0,
            totalUsers -
            paidUsers -
            blockedUsers
          )
      });
    }


    return res.status(400).json({
      ok: false,
      error: "mode yanlışdır"
    });


  } catch (error) {

    console.error(
      "[ADMIN-USERS ERROR]",
      error
    );


    const message =
      error?.message ||
      "Server xətası";


    if (
      message ===
      "AUTH_TOKEN_MISSING"
    ) {

      return res.status(401).json({
        ok: false,
        error:
          "Firebase giriş tokeni göndərilməyib"
      });
    }


    if (
      message ===
      "INVALID_AUTH_TOKEN"
    ) {

      return res.status(401).json({
        ok: false,
        error:
          "Firebase giriş tokeni etibarsızdır"
      });
    }


    if (
      message ===
      "NOT_OWNER"
    ) {

      return res.status(403).json({
        ok: false,
        error:
          "Bu hesab Admin Panel üçün icazəli deyil"
      });
    }


    return res.status(500).json({
      ok: false,
      error: message
    });
  }
};
