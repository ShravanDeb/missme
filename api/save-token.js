import admin from "firebase-admin";
import { getFirestoreAdmin } from "./_lib/firebaseAdmin.js";

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

  const { roomId, token, role, name } = parseBody(req);
  if (!roomId || !token || (role !== "send" && role !== "receive")) {
    return res.status(400).json({ error: "roomId, token and valid role are required" });
  }

  try {
    const db = getFirestoreAdmin();
    const roomRef = db.collection("rooms").doc(roomId);
    const snapshot = await roomRef.get();

    if (!snapshot.exists) {
      return res.status(404).json({ error: "Room not found" });
    }

    const tokenField = role === "send" ? "sendTokens" : "receiveTokens";
    const nameField = role === "send" ? "sendName" : "receiveName";
    const safeName = typeof name === "string" ? name.trim().slice(0, 50) : "";
    await roomRef.set(
      {
        [tokenField]: admin.firestore.FieldValue.arrayUnion(token),
        ...(safeName ? { [nameField]: safeName } : {}),
        tokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save token";
    return res.status(500).json({ error: message });
  }
}
