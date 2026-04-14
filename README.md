# Tap When You Miss Me (PWA)

This project is a full-stack Vercel-ready app where each couple gets an isolated private room:

- Sender page: `/send/:roomId` to tap and subscribe for notifications
- Receiver page: `/receive/:roomId` to watch the live counter, tap back, and subscribe for notifications
- Share page: `/share/:roomId` with both links
- API endpoints: `/api/create-room`, `/api/tap`, `/api/save-token`

## 1. Firebase Setup

1. Create a Firebase project.
2. Enable Firestore Database in production mode.
3. In Firestore, create rules that allow room reads and block arbitrary writes from clients. Example starter rule:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

4. In Project Settings -> General, create a Web App and copy Firebase web config values.
5. In Project Settings -> Cloud Messaging, create a Web Push certificate key pair (VAPID key).
6. In Project Settings -> Service Accounts, generate a new private key JSON file and collect:
   - `project_id`
   - `client_email`
   - `private_key`

## 2. Environment Variables

1. Copy `.env.local.example` to `.env.local`.
2. Fill in all values.
3. Keep quotes around `FIREBASE_PRIVATE_KEY` and preserve `\n` line breaks.

## 3. Local Run

1. Install deps: `npm install`
2. Start full-stack local dev: `npm run dev`
3. Open `http://localhost:5173`
4. Keep this running so `/api/*` routes are served by the local Node API server.
5. Optional: If you want to run Vercel emulation instead, use `npm run dev:api:vercel`.

## 4. Vercel Deployment

1. Push this repo to GitHub.
2. Import project into Vercel.
3. Add every env variable from `.env.local.example` in Vercel Project Settings.
4. Deploy.
5. Set `PUBLIC_APP_URL` to your production URL and redeploy.

## 5. End-to-End Test (Two Phones)

1. Open homepage on phone A and tap **Create Your Bond**.
2. Copy **Her link** and open it on phone B.
3. Open **Your link** on phone A.
4. On phone A, enable notifications when prompted.
5. On phone B, tap the heart.
6. Verify:
  - Counter updates instantly without refresh.
  - Both phones can subscribe for push notifications in the same room.
  - Either phone can tap in the same room.
  - A different room ID does not affect this room.

## API Contract

- `POST /api/create-room` -> `{ roomId, sendLink, receiveLink }`
- `GET /api/room-state?roomId=...` -> `{ exists, tapsFromSend, tapsFromReceive, taps }` for fast sync fallback
- `POST /api/tap` body `{ roomId, fromRole }` where `fromRole` is `send` or `receive`
- `POST /api/save-token` body `{ roomId, token, role, name? }` where `role` is `send` or `receive`
  - if `name` is saved, notification body becomes `"<name> is missing you"`
