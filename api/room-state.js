import { getFirestoreAdmin } from "./_lib/firebaseAdmin.js";

function getRoomId(req) {
  if (req?.query?.roomId) return String(req.query.roomId);
  if (typeof req?.url === "string") {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get("roomId") || "";
  }
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const roomId = getRoomId(req);
  if (!roomId) {
    return res.status(400).json({ error: "roomId is required" });
  }

  try {
    const db = getFirestoreAdmin();
    const snapshot = await db.collection("rooms").doc(roomId).get();

    if (!snapshot.exists) {
      return res.status(200).json({ exists: false, taps: 0 });
    }

    const data = snapshot.data() ?? {};
    const taps = typeof data.taps === "number" ? data.taps : 0;
    return res.status(200).json({ exists: true, taps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read room state";
    return res.status(500).json({ error: message });
  }
}
