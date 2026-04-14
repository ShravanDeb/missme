import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);

async function getMessagingClient() {
  if (typeof window === "undefined") return null;
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(firebaseApp);
}

export async function requestRoomNotifications(
  roomId: string,
  role: "send" | "receive",
  name?: string
): Promise<{ ok: boolean; message: string }> {
  const client = await getMessagingClient();
  if (!client) {
    return { ok: false, message: "Push notifications are not supported on this device." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notification permission was not granted." };
  }

  const registration = await navigator.serviceWorker.register("/service-worker.js");
  const token = await getToken(client, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration
  });

  if (!token) {
    return { ok: false, message: "Could not create a notification token." };
  }

  const response = await fetch("/api/save-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, token, role, name })
  });

  if (!response.ok) {
    return { ok: false, message: "Token generated, but saving it failed." };
  }

  return { ok: true, message: "Notifications are enabled for this bond." };
}

export const requestReceiverNotifications = (roomId: string) => requestRoomNotifications(roomId, "receive");

export async function subscribeForegroundNotifications(
  callback: (payload: MessagePayload) => void
): Promise<() => void> {
  const client = await getMessagingClient();
  if (!client) return () => {};
  return onMessage(client, callback);
}
