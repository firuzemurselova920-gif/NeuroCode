const admin = require("firebase-admin");
const crypto = require("crypto");

const PLANKEY_MAP = {
  basic: "go",
  pro: "premium",
  annual: "premium"
};

/* =========================================================
   FIREBASE INIT
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
   RAW BODY
========================================================= */

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}


/* =========================================================
   PADDLE SIGNATURE VERIFY
========================================================= */

function verifySignature(
  signatureHeader,
  rawBody,
  secret
) {
  try {
    if (
      !signatureHeader ||
      !rawBody ||
      !secret
    ) {
      return false;
    }

    const parts = {};

    String(signatureHeader)
      .split(";")
      .forEach(part => {
        const index =
          part.indexOf("=");

        if (index === -1) {
          return;
        }

        const key =
          part
            .slice(0, index)
            .trim();

        const value =
          part
            .slice(index + 1)
            .trim();

        if (key && value) {
          parts[key] = value;
        }
      });


    const timestamp =
      parts.ts;

    const receivedSignature =
      parts.h1;


    if (
      !timestamp ||
      !receivedSignature
    ) {
      return false;
    }


    /*
    Replay hücumlarına qarşı timestamp yoxlaması.
    Maksimum 5 dəqiqə fərq.
    */

    const timestampMs =
      Number(timestamp) * 1000;

    const tolerance =
      5 * 60 * 1000;


    if (
      !Number.isFinite(timestampMs) ||
      Math.abs(
        Date.now() - timestampMs
      ) > tolerance
    ) {
      return false;
    }


    const signedPayload =
      timestamp +
      ":" +
      rawBody.toString("utf8");


    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(signedPayload)
        .digest("hex");


    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        "hex"
      );

    const receivedBuffer =
      Buffer.from(
        receivedSignature,
        "hex"
      );


    if (
      expectedBuffer.length !==
      receivedBuffer.length
    ) {
      return false;
    }


    return crypto.timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    );

  } catch (error) {

    console.error(
      "[PADDLE SIGNATURE ERROR]",
      error.message
    );

    return false;
  }
}


/* =========================================================
   MAIN WEBHOOK
========================================================= */

module.exports =
async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      ok: false,
      error:
        "Yalnız POST sorğusu qəbul edilir"
    });
  }


  try {

    initFirebase();


    const webhookSecret =
      process.env.PADDLE_WEBHOOK_SECRET;


    if (!webhookSecret) {

      return res.status(500).json({
        ok: false,
        error:
          "PADDLE_WEBHOOK_SECRET yoxdur"
      });
    }


    /* =====================================================
       RAW BODY AL
    ===================================================== */

    const rawBody =
      await readRawBody(req);


    if (!rawBody.length) {

      return res.status(400).json({
        ok: false,
        error:
          "Webhook body boşdur"
      });
    }


    /* =====================================================
       SIGNATURE CHECK
    ===================================================== */

    const signature =
      req.headers[
        "paddle-signature"
      ];


    const validSignature =
      verifySignature(
        signature,
        rawBody,
        webhookSecret
      );


    if (!validSignature) {

      console.error(
        "[PADDLE] Etibarsız imza"
      );

      return res.status(401).json({
        ok: false,
        error:
          "Paddle webhook imzası etibarsızdır"
      });
    }


    /* =====================================================
       JSON PARSE
    ===================================================== */

    let event;

    try {

      event =
        JSON.parse(
          rawBody.toString("utf8")
        );

    } catch (error) {

      return res.status(400).json({
        ok: false,
        error:
          "Webhook JSON formatı yanlışdır"
      });
    }


    const eventType =
      String(
        event.event_type || ""
      );


    const data =
      event.data || {};


    const customData =
      data.custom_data || {};


    const uid =
      String(
        customData.uid || ""
      ).trim();


    /*
    UID yoxdursa webhook-u yenidən göndərməməsi
    üçün Paddle-a 200 qaytarırıq.
    */

    if (!uid) {

      console.warn(
        "[PADDLE] custom_data.uid yoxdur"
      );

      return res.status(200).json({
        ok: true,
        ignored: true,
        reason:
          "custom_data.uid yoxdur"
      });
    }


    const db =
      admin.firestore();


    const entitlementRef =
      db.doc(
        `entitlements/${uid}`
      );


    /* =====================================================
       ÖDƏNİŞ / ABUNƏ AKTİVDİR
    ===================================================== */

    const activeEvents = [
      "transaction.completed",
      "subscription.activated",
      "subscription.updated"
    ];


    if (
      activeEvents.includes(
        eventType
      )
    ) {

      const planKey =
        String(
          customData.planKey || ""
        );


      const plan =
        PLANKEY_MAP[planKey] ||
        "premium";


      const billingEnd =
        data.billing_period?.ends_at;


      const expiryTimeMillis =
        billingEnd
          ? Date.parse(billingEnd)
          : null;


      await entitlementRef.set(
        {
          plan,

          source: "paddle",

          paddleEvent:
            eventType,

          paddleSubscriptionId:
            data.subscription_id ||
            data.id ||
            null,

          expiryTimeMillis:
            Number.isFinite(
              expiryTimeMillis
            )
              ? expiryTimeMillis
              : null,

          updatedAt:
            Date.now()
        },

        {
          merge: true
        }
      );


      return res.status(200).json({
        ok: true,
        processed: true,
        uid,
        plan
      });
    }


    /* =====================================================
       ABUNƏ DAYANDIRILIB
    ===================================================== */

    const inactiveEvents = [
      "subscription.canceled",
      "subscription.past_due"
    ];


    if (
      inactiveEvents.includes(
        eventType
      )
    ) {

      /*
      Founding istifadəçisini Paddle webhook
      pulsuz plana SALMAMALIDIR.
      */

      const currentSnapshot =
        await entitlementRef.get();


      const current =
        currentSnapshot.exists
          ? currentSnapshot.data()
          : {};


      if (
        current.source === "founding"
      ) {

        return res.status(200).json({
          ok: true,
          ignored: true,
          reason:
            "Founding üzvünün ömürlük girişi qorundu"
        });
      }


      await entitlementRef.set(
        {
          plan: "free",

          source: "paddle",

          paddleEvent:
            eventType,

          expiryTimeMillis:
            null,

          updatedAt:
            Date.now()
        },

        {
          merge: true
        }
      );


      return res.status(200).json({
        ok: true,
        processed: true,
        uid,
        plan: "free"
      });
    }


    /* =====================================================
       DİGƏR EVENT
    ===================================================== */

    return res.status(200).json({
      ok: true,
      ignored: true,
      eventType
    });


  } catch (error) {

    console.error(
      "[PADDLE WEBHOOK ERROR]",
      error
    );


    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Paddle webhook server xətası"
    });
  }
};


/* =========================================================
   UNIT TEST EXPORT
========================================================= */

module.exports.verifySignature =
  verifySignature;
