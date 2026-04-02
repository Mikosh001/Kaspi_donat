# Firebase Backend

This folder contains a Firebase-first backend for Kaz Alerts:

- Email/Password auth can be handled by Firebase Authentication.
- One-time device connect code API is in Cloud Functions.
- Donations, settings, and precomputed analytics are stored in Firestore.

## Structure

- `functions/src/index.js` - HTTP API (`functions:api`) compatible with existing `/api/*` frontend calls.
- `firestore.rules` - Firestore security rules (default deny; API goes through Functions admin SDK).
- `firestore.indexes.json` - index config.

## Deploy

1. Copy `.firebaserc.example` to `.firebaserc` and set your project id.
2. Install Firebase CLI and login:

```bash
npm i -g firebase-tools
firebase login
```

3. Install functions dependencies:

```bash
cd firebase/functions
npm install
```

4. Deploy functions + firestore config:

```bash
cd ..
firebase deploy --only functions:api,firestore:rules,firestore:indexes
```

## API Endpoints

Function base URL example:

`https://us-central1-<project-id>.cloudfunctions.net/api`

Main routes (same shape as existing web client):

- `GET /health`
- `GET /state`
- `GET /settings`
- `POST /settings`
- `GET /feed`
- `GET /donations`
- `GET /music-feed`
- `GET /stats/:board`
- `GET /goal`
- `GET /analytics/summary`
- `GET /profile`
- `POST /test-donation`
- `POST /cloud/register`
- `POST /cloud/rotate-token`
- `POST /cloud/bind-device`
- `POST /cloud/ingest`
- `POST /cloud/create-connect-code`
- `POST /cloud/claim-device`

## One-time Code Flow

1. Streamer signs in via Firebase Auth (Email/Password) in the web client.
2. Web client calls `POST /cloud/create-connect-code` with Firebase ID token.
3. Desktop app enters code and calls `POST /cloud/claim-device`.
4. Desktop receives `streamer_id` + ingest `token` and uses it for `/cloud/ingest`.

## Important Env Vars (Functions)

- `KAZ_ALERTS_PUBLIC_BASE_URL=https://your-domain.com`
- `KAZ_ALERTS_ENFORCE_STREAMER_SCOPE=1`
- `KAZ_ALERTS_DEFAULT_STREAMER_ID=default`
- `KAZ_ALERTS_FIREBASE_REGION=us-central1`
- `KAZ_ALERTS_CONNECT_CODE_TTL_SECONDS=600`
