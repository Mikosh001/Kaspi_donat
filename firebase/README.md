# Firebase Direct Setup

This folder now targets a Functions-free architecture:

- Web overlay reads/writes Firestore directly (via Firebase Web SDK).
- Desktop app writes donations to Firestore directly (via Firebase REST + Auth).
- Multi-tenant isolation is enforced by Firestore Rules owner checks.

## Structure

- `firestore.rules` - owner-only write + public read rules for `streamers/*`.
- `firestore.indexes.json` - indexes for direct mode queries.
- `functions/` - legacy optional backend code (not required for direct mode).

## Deploy (Spark Friendly)

1. Copy `.firebaserc.example` to `.firebaserc` and set project id.
2. Install CLI and login:

```bash
npm i -g firebase-tools
firebase login
```

3. Deploy Firestore security config:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

No Cloud Functions deployment is required for the main flow.

## Data Model (Direct Mode)

- `streamers/{streamer_id}`: profile (`owner_uid`, `display_name`, `token`, `last_seq`)
- `streamers/{streamer_id}/settings/main`: overlay settings (`data`)
- `streamers/{streamer_id}/donations/*`: donation events
- `streamers/{streamer_id}/analytics/current`: summary metrics
- `streamers/{streamer_id}/donor_stats/*`: per-donor counters
- `streamers/{streamer_id}/leaderboards/*`: day/week/month top lists
- `streamers/{streamer_id}/devices/*`: known devices

## Auth Model

1. Streamer signs in with Firebase Email/Password.
2. Streamer saves profile on `/connect` page.
3. Profile stores `owner_uid = auth.uid`.
4. Firestore rules allow writes only when `request.auth.uid == owner_uid`.

## Desktop Environment Variables

- `KAZ_ALERTS_FIREBASE_DIRECT=1`
- `KAZ_ALERTS_FIREBASE_API_KEY=<web api key>`
- `KAZ_ALERTS_FIREBASE_PROJECT_ID=<project id>`
- `KAZ_ALERTS_FIREBASE_AUTH_EMAIL=<streamer email>`
- `KAZ_ALERTS_FIREBASE_AUTH_PASSWORD=<streamer password>`

## Legacy Optional Mode

If you still want HTTP `/api/*` backend mode, the old Functions implementation is available in `functions/src/index.js`, but it is not required for direct mode.
