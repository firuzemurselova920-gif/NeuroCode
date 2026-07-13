const admin = require("firebase-admin");

const FOUNDING_LIMIT = 100;

/* =========================================================
   FIREBASE ADMIN INIT
========================================================= */

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
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT JSON formatı yanlışdır"
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}


/* =========================================================
   BODY PARSER
========================================================= */

function getBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return {};
    }
  }

  return req.body;
}


/* =========================================================
   OWNER YOXLAMASI
========================================================= */

async function getOwner(req) {
  const authorization = String(
    req.headers.authorization || ""
  ).trim();

  const token = authorization.replace(
    /^Bearer\s+/i,
    ""
  );

  if (!token) {
    return null;
  }

  const ownerEmail = String(
    process.env.OWNER_EMAIL || ""
  )
    .trim()
    .toLowerCase();

  if (!ownerEmail) {
    return null;
  }

  try {
    const decoded = await admin
      .auth()
      .verifyIdToken(token);

    const email = String(
      decoded.email || ""
    )
      .trim()
      .toLowerCase();

    if (email !== ownerEmail) {
      return null;
    }

    return decoded;

  } catch (error) {
    return null;
  }
}


/* =========================================================
   STATUS HESABLANMASI
========================================================= */

function getMemberStatus(entitlement) {
  const plan = String(
    entitlement?.plan || "free"
  ).toLowerCase();

  if (plan === "blocked") {
    return {
      plan,
      status: "Bloklanıb",
      limitStatus: "BLOCKED"
    };
  }

  if (
    plan === "premium" ||
    plan === "active" ||
    plan === "go"
  ) {
    return {
      plan,
      status:
        entitlement?.source === "founding"
          ? "Founding üzvü"
          : "Aktiv üzv",

      limitStatus: "ACTIVE"
    };
  }

  return {
    plan: "free",
    status: "Pulsuz",
    limitStatus: "FREE"
  };
}


/* =========================================================
   MAIN HANDLER
========================================================= */

module.exports = async function handler(req, res) {

  /* =======================================================
     CORS
  ======================================================= */

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

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  try {

    initFirebase();

    const db = admin.firestore();

    const counterRef =
      db.doc("counters/founding");


    /* =====================================================
       GET
    ===================================================== */

    if (req.method === "GET") {

      const counterSnapshot =
        await counterRef.get();

      const rawCount =
        counterSnapshot.exists
          ? Number(
              counterSnapshot.data()?.count || 0
            )
          : 0;

      const count =
        Math.min(
          rawCount,
          FOUNDING_LIMIT
        );

      const response = {
        ok: true,

        count,

        remaining:
          Math.max(
            0,
            FOUNDING_LIMIT - count
          ),

        closed:
          count >= FOUNDING_LIMIT
      };


      /* ===================================================
         OWNER CHECK
      =================================================== */

      const owner =
        await getOwner(req);


      /*
      Adi istifadəçiyə yalnız public məlumat qaytarılır.
      */

      if (!owner) {
        return res
          .status(200)
          .json(response);
      }


      /* ===================================================
         FOUNDING MEMBERS
      =================================================== */

      const membersSnapshot =
        await db
          .collection("founding_members")
          .orderBy("number", "asc")
          .get();


      if (membersSnapshot.empty) {

        response.members = [];

        return res
          .status(200)
          .json(response);
      }


      /* ===================================================
         ENTITLEMENT REFS
      =================================================== */

      const entitlementRefs =
        membersSnapshot.docs.map(doc => {

          const member =
            doc.data();

          const uid =
            member.uid ||
            doc.id;

          return db.doc(
            `entitlements/${uid}`
          );
        });


      const entitlementSnapshots =
        await db.getAll(
          ...entitlementRefs
        );


      /* ===================================================
         REAL MEMBER DATA
      =================================================== */

      response.members =
        membersSnapshot.docs.map(
          (doc, index) => {

            const member =
              doc.data() || {};

            const entitlementSnapshot =
              entitlementSnapshots[index];

            const entitlement =
              entitlementSnapshot?.exists
                ? entitlementSnapshot.data()
                : {};

            const memberStatus =
              getMemberStatus(
                entitlement
              );

            return {

              uid:
                member.uid ||
                doc.id,

              number:
                Number(
                  member.number || 0
                ),

              name:
                String(
                  member.name || ""
                ),

              email:
                String(
                  member.email || ""
                ),

              date:
                Number(
                  member.date || 0
                ),

              plan:
                memberStatus.plan,

              status:
                memberStatus.status,

              limitStatus:
                memberStatus.limitStatus
            };
          }
        );


      return res
        .status(200)
        .json(response);
    }


    /* =====================================================
       METHOD CHECK
    ===================================================== */

    if (req.method !== "POST") {

      return res.status(405).json({
        ok: false,
        error:
          "Yalnız GET və POST qəbul edilir"
      });
    }


    /* =====================================================
       POST BODY
    ===================================================== */

    const body =
      getBody(req);

    const idToken =
      String(
        body.idToken || ""
      ).trim();

    const name =
      String(
        body.name || ""
      )
        .trim()
        .slice(0, 80);


    if (!idToken) {

      return res.status(401).json({
        ok: false,
        error:
          "Firebase idToken tələb olunur"
      });
    }


    /* =====================================================
       TOKEN VERIFY
    ===================================================== */

    let decoded;

    try {

      decoded =
        await admin
          .auth()
          .verifyIdToken(
            idToken
          );

    } catch (error) {

      return res.status(401).json({
        ok: false,
        error:
          "Firebase token etibarsızdır"
      });
    }


    const uid =
      decoded.uid;

    const email =
      String(
        decoded.email || ""
      );


    /* =====================================================
       REFERENCES
    ===================================================== */

    const memberRef =
      db.doc(
        `founding_members/${uid}`
      );

    const entitlementRef =
      db.doc(
        `entitlements/${uid}`
      );

    const activityRef =
      db.doc(
        `activity/${uid}`
      );


    /* =====================================================
       ATOMIC TRANSACTION
    ===================================================== */

    const result =
      await db.runTransaction(
        async transaction => {

          const [
            counterSnapshot,
            memberSnapshot
          ] =
            await Promise.all([

              transaction.get(
                counterRef
              ),

              transaction.get(
                memberRef
              )

            ]);


          /* ===============================================
             İSTİFADƏÇİ ARTIQ FOUNDING ÜZVÜDÜR
          =============================================== */

          if (memberSnapshot.exists) {

            const existingMember =
              memberSnapshot.data();

            return {

              ok: true,

              existing: true,

              number:
                Number(
                  existingMember.number || 0
                ),

              count:
                counterSnapshot.exists
                  ? Number(
                      counterSnapshot.data()?.count || 0
                    )
                  : 0
            };
          }


          /* ===============================================
             CURRENT COUNT
          =============================================== */

          const currentCount =
            counterSnapshot.exists
              ? Number(
                  counterSnapshot.data()?.count || 0
                )
              : 0;


          /* ===============================================
             FOUNDING CLOSED
          =============================================== */

          if (
            currentCount >=
            FOUNDING_LIMIT
          ) {

            return {

              ok: false,

              closed: true,

              count:
                FOUNDING_LIMIT
            };
          }


          /* ===============================================
             NEW NUMBER
          =============================================== */

          const number =
            currentCount + 1;

          const now =
            Date.now();


          /* ===============================================
             FOUNDING MEMBER CREATE
          =============================================== */

          transaction.set(

            memberRef,

            {
              uid,

              number,

              name,

              email,

              date: now
            },

            {
              merge: true
            }
          );


          /* ===============================================
             COUNTER UPDATE
          =============================================== */

          transaction.set(

            counterRef,

            {
              count: number,

              updatedAt: now
            },

            {
              merge: true
            }
          );


          /* ===============================================
             PREMIUM ACCESS
          =============================================== */

          transaction.set(

            entitlementRef,

            {
              plan: "premium",

              source: "founding",

              expiryTimeMillis: null,

              activatedAt: now,

              updatedAt: now
            },

            {
              merge: true
            }
          );


          /*
          ÇOX VACİB DÜZƏLİŞ:

          İstifadəçi Founding proqramına daxil olduqda
          activity sənədi də yaradılır.

          Beləliklə Admin Panel istifadəçinin
          adını, emailini və rolunu görə bilir.
          */


          transaction.set(

            activityRef,

            {
              uid,

              name:
                name ||
                decoded.name ||
                "",

              email,

              role: "student",

              registeredAt: now,

              lastSeen: now
            },

            {
              merge: true
            }
          );


          return {

            ok: true,

            existing: false,

            number,

            count: number,

            plan: "premium",

            status: "active"
          };
        }
      );


    return res
      .status(200)
      .json(result);


  } catch (error) {

    console.error(
      "[FOUNDING ERROR]",
      error
    );


    return res.status(500).json({

      ok: false,

      error:
        error?.message ||
        "Founding server xətası"

    });
  }
};
