const admin = require("firebase-admin");

const TRIAL_MS = 72 * 60 * 60 * 1000;

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

async function requireOwner(req) {
  const authorization = String(
    req.headers.authorization || ""
  ).trim();

  const token = authorization.replace(/^Bearer\s+/i, "");

  const ownerEmail = String(
    process.env.OWNER_EMAIL || ""
  )
    .trim()
    .toLowerCase();

  if (!token) {
    throw new Error("AUTH_TOKEN_MISSING");
  }

  if (!ownerEmail) {
    throw new Error("OWNER_EMAIL_MISSING");
  }

  const decoded = await admin.auth().verifyIdToken(token);

  const userEmail = String(decoded.email || "")
    .trim()
    .toLowerCase();

  if (userEmail !== ownerEmail) {
    throw new Error("NOT_OWNER");
  }

  return decoded;
}

function getUserStatus(user, entitlement, founding) {
  const plan = entitlement?.plan || "free";

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

  const created = user.metadata?.creationTime
    ? Date.parse(user.metadata.creationTime)
    : 0;

  if (!created) {
    return "TRIAL";
  }

  const elapsed = Date.now() - created;

  return elapsed >= TRIAL_MS
    ? "TRIAL_EXPIRED"
    : "TRIAL";
}

function createUserRow(user, entitlement, activity, founding) {
  const created = user.metadata?.creationTime
    ? Date.parse(user.metadata.creationTime)
    : 0;

  const trialEnd = created
    ? created + TRIAL_MS
    : 0;

  const trialRemaining = trialEnd
    ? Math.max(0, trialEnd - Date.now())
    : 0;

  const limitStatus = getUserStatus(
    user,
    entitlement,
    founding
  );

  const statusLabels = {
    ACTIVE: "Aktiv",
    TRIAL: "Trial",
    TRIAL_EXPIRED: "Trial bitib",
    BLOCKED: "Bloklanıb"
  };

  return {
    uid: user.uid,
    email: user.email || "",
    name:
      activity?.name ||
      founding?.name ||
      user.displayName ||
      "",

    created,

    lastLogin: user.metadata?.lastSignInTime
      ? Date.parse(user.metadata.lastSignInTime)
      : null,

    lastSeen: activity?.lastSeen || null,

    plan: entitlement?.plan || "free",

    status: statusLabels[limitStatus],

    limitStatus,

    trialEnd,

    trialRemaining,

    testsStarted: activity?.testsStarted || 0,

    testsCompleted:
      activity?.testsCompleted || 0,

    aiMessages:
      activity?.aiMessages || 0,

    qAnswered:
      activity?.qAnswered || 0,

    qCorrect:
      activity?.qCorrect || 0,

    qWrong:
      activity?.qWrong || 0
  };
}

async function attachUserData(db, users) {
  if (!users.length) return [];

  const refs = [];

  for (const user of users) {
    refs.push(
      db.doc(`entitlements/${user.uid}`),
      db.doc(`activity/${user.uid}`),
      db.doc(`founding_members/${user.uid}`)
    );
  }

  const snapshots = await db.getAll(...refs);

  return users.map((user, index) => {
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
  });
}

module.exports = async function handler(req, res) {
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
    return res.status(200).end();
  }

  try {
    initFirebase();

    const owner = await requireOwner(req);

    const db = admin.firestore();

    const query = req.query || {};

    const mode = String(
      query.mode || "list"
    );

    const uid = query.uid
      ? String(query.uid)
      : null;

    /*
    ==========================
    ACTIVATE USER
    ==========================
    */

    if (mode === "activate") {
      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID tələb olunur"
        });
      }

      await db
        .doc(`entitlements/${uid}`)
        .set(
          {
            plan: "active",
            activatedAt: Date.now(),
            activatedBy: owner.email
          },
          {
            merge: true
          }
        );

      return res.status(200).json({
        ok: true,
        action: "activate",
        uid
      });
    }

    /*
    ==========================
    BLOCK USER
    ==========================
    */

    if (mode === "block") {
      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID tələb olunur"
        });
      }

      await db
        .doc(`entitlements/${uid}`)
        .set(
          {
            plan: "blocked",
            blockedAt: Date.now(),
            blockedBy: owner.email
          },
          {
            merge: true
          }
        );

      return res.status(200).json({
        ok: true,
        action: "block",
        uid
      });
    }

    /*
    ==========================
    UNBLOCK USER
    ==========================
    */

    if (mode === "deactivate") {
      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID tələb olunur"
        });
      }

      await db
        .doc(`entitlements/${uid}`)
        .set(
          {
            plan: "free",
            deactivatedAt: Date.now(),
            deactivatedBy: owner.email
          },
          {
            merge: true
          }
        );

      return res.status(200).json({
        ok: true,
        action: "deactivate",
        uid
      });
    }

    /*
    ==========================
    EXTEND TRIAL
    ==========================
    */

    if (mode === "extend") {
      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID tələb olunur"
        });
      }

      await db
        .doc(`entitlements/${uid}`)
        .set(
          {
            plan: "active",
            extendedAt: Date.now(),
            extendedBy: owner.email
          },
          {
            merge: true
          }
        );

      return res.status(200).json({
        ok: true,
        action: "extend",
        uid
      });
    }

    /*
    ==========================
    USER DETAIL
    ==========================
    */

    if (mode === "detail") {
      if (!uid) {
        return res.status(400).json({
          ok: false,
          error: "UID tələb olunur"
        });
      }

      const user =
        await admin.auth().getUser(uid);

      const rows =
        await attachUserData(db, [user]);

      return res.status(200).json({
        ok: true,
        user: rows[0]
      });
    }

    /*
    ==========================
    USER LIST
    ==========================
    */

    if (mode === "list") {
      const search = String(
        query.search || ""
      )
        .trim()
        .toLowerCase();

      if (search) {
        try {
          const user =
            await admin
              .auth()
              .getUserByEmail(search);

          const rows =
            await attachUserData(
              db,
              [user]
            );

          return res.status(200).json({
            ok: true,
            users: rows,
            nextPageToken: null
          });
        } catch (error) {
          return res.status(200).json({
            ok: true,
            users: [],
            nextPageToken: null
          });
        }
      }

      const page =
        await admin.auth().listUsers(
          100,

          query.pageToken
            ? String(query.pageToken)
            : undefined
        );

      const rows =
        await attachUserData(
          db,
          page.users
        );

      return res.status(200).json({
        ok: true,
        users: rows,
        nextPageToken:
          page.pageToken || null
      });
    }

    /*
    ==========================
    STATISTICS
    ==========================
    */

    if (mode === "stats") {
      let totalUsers = 0;

      let newToday = 0;

      let newLast7Days = 0;

      let pageToken;

      const now = Date.now();

      const weekAgo =
        now - 7 * 24 * 60 * 60 * 1000;

      const today =
        new Date();

      today.setHours(0, 0, 0, 0);

      const todayStart =
        today.getTime();

      do {
        const page =
          await admin.auth().listUsers(
            1000,
            pageToken
          );

        totalUsers += page.users.length;

        for (const user of page.users) {
          const created =
            user.metadata?.creationTime
              ? Date.parse(
                  user.metadata.creationTime
                )
              : 0;

          if (created >= weekAgo) {
            newLast7Days++;
          }

          if (created >= todayStart) {
            newToday++;
          }
        }

        pageToken =
          page.pageToken;

      } while (pageToken);

      return res.status(200).json({
        ok: true,
        totalUsers,
        newToday,
        newLast7Days
      });
    }

    return res.status(400).json({
      ok: false,
      error: "Yanlış mode"
    });

  } catch (error) {
    console.error(
      "[ADMIN USERS ERROR]",
      error
    );

    const message =
      error.message || "Server xətası";

    if (
      message === "AUTH_TOKEN_MISSING" ||
      message === "NOT_OWNER"
    ) {
      return res.status(403).json({
        ok: false,
        error:
          "Admin icazəsi təsdiqlənmədi"
      });
    }

    if (
      message === "OWNER_EMAIL_MISSING"
    ) {
      return res.status(500).json({
        ok: false,
        error:
          "OWNER_EMAIL konfiqurasiyası yoxdur"
      });
    }

    return res.status(500).json({
      ok: false,
      error: message
    });
  }
};
