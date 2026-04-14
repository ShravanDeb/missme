import { customAlphabet } from "nanoid";
import admin from "firebase-admin";
import { getFirestoreAdmin } from "./_lib/firebaseAdmin.js";

const makeRoomId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

function baseUrlFromRequest(req) {
  const configured = process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  const host = req.headers.host;
  if (!host) return "";
  return `${host.includes("localhost") ? "http" : "https"}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const roomId = makeRoomId();
    const db = getFirestoreAdmin();

    await db.collection("rooms").doc(roomId).set({
      tapsFromSend: 0,
      tapsFromReceive: 0,
      sendTokens: [],
      receiveTokens: [],
      sendName: "",
      receiveName: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const baseUrl = baseUrlFromRequest(req);

    return res.status(200).json({
      roomId,
      sendLink: `${baseUrl}/send/${roomId}`,
      receiveLink: `${baseUrl}/receive/${roomId}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create room";
    return res.status(500).json({ error: message });
  }
}
