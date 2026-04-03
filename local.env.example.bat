@echo off
rem Copy this file to local.env.bat and set your own values.
set KAZ_ALERTS_STREAMER_ID=streamer123
set KAZ_ALERTS_AUTOSTART=1

rem Preferred free mode: direct Firebase Auth + Firestore (no Cloud Functions)
set KAZ_ALERTS_FIREBASE_DIRECT=1
set KAZ_ALERTS_FIREBASE_API_KEY=replace-me
set KAZ_ALERTS_FIREBASE_PROJECT_ID=replace-me
set KAZ_ALERTS_FIREBASE_AUTH_EMAIL=streamer@example.com
set KAZ_ALERTS_FIREBASE_AUTH_PASSWORD=replace-me

rem Optional legacy API mode (leave empty when using direct mode)
set KAZ_ALERTS_CONNECT_URL=
set KAZ_ALERTS_API_URL=
set KAZ_ALERTS_API_KEY=

set KAZ_ALERTS_PUBLIC_BASE_URL=https://kaspi-donat.vercel.app
