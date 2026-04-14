import admin from "firebase-admin";
import { getFirestoreAdmin, getMessagingAdmin } from "./_lib/firebaseAdmin.js";

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { roomId, fromRole } = parseBody(req);
  if (!roomId || (fromRole !== "send" && fromRole !== "receive")) {
    return res.status(400).json({ error: "roomId and valid fromRole are required" });
  }

  try {
    const db = getFirestoreAdmin();
    const roomRef = db.collection("rooms").doc(roomId);
    let nextTapCount = 0;
    let targetRole = "receive";
    let counterField = "tapsFromSend";
    let notificationTokens = [];
    let actorName = "";

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists) {
        throw new Error("ROOM_NOT_FOUND");
      }

      const data = snapshot.data() ?? {};
      targetRole = fromRole === "send" ? "receive" : "send";
      counterField = fromRole === "send" ? "tapsFromSend" : "tapsFromReceive";
      const actorNameField = fromRole === "send" ? "sendName" : "receiveName";
      actorName = typeof data[actorNameField] === "string" ? data[actorNameField].trim() : "";
      const baseSend = typeof data.tapsFromSend === "number" ? data.tapsFromSend : 0;
      const baseReceive = typeof data.tapsFromReceive === "number" ? data.tapsFromReceive : 0;
      const current = typeof data[counterField] === "number" ? data[counterField] : 0;
      nextTapCount = current + 1;
      const targetField = targetRole === "send" ? "sendTokens" : "receiveTokens";
      const tokens = Array.isArray(data[targetField]) ? data[targetField].filter((item) => typeof item === "string" && item) : [];
      const legacyToken = typeof data.receiverToken === "string" && data.receiverToken ? [data.receiverToken] : [];
      notificationTokens = Array.from(new Set([...tokens, ...legacyToken]));

      transaction.update(roomRef, {
        tapsFromSend: baseSend,
        tapsFromReceive: baseReceive,
        [counterField]: nextTapCount,
        lastTapAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    if (notificationTokens.length > 0) {
      const appUrl = (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
      const messaging = getMessagingAdmin();
      const displayName = actorName || "Someone";
      const body = `${displayName} is missing you. (tap #${nextTapCount.toLocaleString()})`;
      const result = await messaging.sendEachForMulticast({
        tokens: notificationTokens,
        notification: {
          title: "Tap When You Miss Me",
          body
        },
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            title: "Tap When You Miss Me",
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png"
          },
          fcmOptions: appUrl ? { link: `${appUrl}/share/${roomId}` } : undefined
        }
      });

      const invalidCodes = new Set(["messaging/invalid-registration-token", "messaging/registration-token-not-registered"]);
      const invalidTokens = result.responses
        .map((response, index) => (response.success ? null : { token: notificationTokens[index], code: response.error?.code }))
        .filter((item) => item && invalidCodes.has(item.code))
        .map((item) => item.token);

      if (invalidTokens.length > 0) {
        const targetField = targetRole === "send" ? "sendTokens" : "receiveTokens";
        await roomRef.set(
          { [targetField]: admin.firestore.FieldValue.arrayRemove(...invalidTokens) },
          { merge: true }
        );
      }
    }

    return res.status(200).json({ taps: nextTapCount, counterField, notified: notificationTokens.length > 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process tap";
    if (message === "ROOM_NOT_FOUND") {
      return res.status(404).json({ error: "Room not found" });
    }
    return res.status(500).json({ error: message });
  }
}
