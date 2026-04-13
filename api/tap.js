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

  const { roomId } = parseBody(req);
  if (!roomId) {
    return res.status(400).json({ error: "roomId is required" });
  }

  try {
    const db = getFirestoreAdmin();
    const roomRef = db.collection("rooms").doc(roomId);
    let nextTapCount = 0;
    let receiverToken = "";

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists) {
        throw new Error("ROOM_NOT_FOUND");
      }

      const data = snapshot.data() ?? {};
      const current = typeof data.taps === "number" ? data.taps : 0;
      nextTapCount = current + 1;
      receiverToken = typeof data.receiverToken === "string" ? data.receiverToken : "";

      transaction.update(roomRef, {
        taps: nextTapCount,
        lastTapAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    if (receiverToken) {
      const appUrl = (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
      const messaging = getMessagingAdmin();
      const body = `She's thinking of you 💛 (tap #${nextTapCount.toLocaleString()})`;
      await messaging.send({
        token: receiverToken,
        notification: {
          title: "She's thinking of you",
          body
        },
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            title: "She's thinking of you",
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png"
          },
          fcmOptions: appUrl ? { link: `${appUrl}/receive/${roomId}` } : undefined
        }
      });
    }

    return res.status(200).json({ taps: nextTapCount, notified: Boolean(receiverToken) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process tap";
    if (message === "ROOM_NOT_FOUND") {
      return res.status(404).json({ error: "Room not found" });
    }
    return res.status(500).json({ error: message });
  }
}
