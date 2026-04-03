import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-analytics.js";

const statusBox = document.getElementById("status-box");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const streamerIdInput = document.getElementById("streamer-id");
const displayNameInput = document.getElementById("display-name");
const codeBox = document.getElementById("connect-code");
const expiresBox = document.getElementById("connect-expires");

const firebaseConfig = window.KAZ_FIREBASE_CONFIG || null;

let auth = null;
let db = null;

async function initAnalytics(app) {
  try {
    if (!firebaseConfig?.measurementId) {
      return;
    }
    const supported = await isSupported();
    if (!supported) {
      return;
    }
    getAnalytics(app);
  } catch (_) {
    // Analytics is optional; auth/firestore flow must continue even if unavailable.
  }
}

function setStatus(text, isError = false) {
  statusBox.textContent = text;
  statusBox.style.color = isError ? "#b13220" : "#1f3d2f";
  statusBox.style.background = isError ? "#fff1ef" : "#eef9f0";
}

function normalizeStreamerId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);
}

function randomToken(length = 48) {
  const bytes = new Uint8Array(Math.max(16, length));
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").slice(0, length);
}

async function ensureSignedInUser() {
  const user = auth?.currentUser;
  if (!user) {
    throw new Error("Алдымен Sign in жасаңыз");
  }
  return user;
}

async function saveStreamerProfile() {
  const user = await ensureSignedInUser();
  const streamerId = normalizeStreamerId(streamerIdInput.value || user.uid);
  if (!streamerId) {
    throw new Error("Streamer ID енгізіңіз");
  }

  const displayName = String(displayNameInput.value || user.email || streamerId).trim();
  const profileRef = doc(db, "streamers", streamerId);
  const profileSnap = await getDoc(profileRef);
  const current = profileSnap.exists() ? (profileSnap.data() || {}) : {};

  const ownerUid = String(current.owner_uid || "");
  if (ownerUid && ownerUid !== user.uid) {
    throw new Error("Бұл streamer_id басқа аккаунтқа тиесілі");
  }

  const nowIso = new Date().toISOString();
  await setDoc(
    profileRef,
    {
      streamer_id: streamerId,
      display_name: displayName,
      owner_uid: user.uid,
      token: String(current.token || "").trim() || randomToken(),
      created_at_iso: String(current.created_at_iso || "").trim() || nowIso,
      updated_at_iso: nowIso
    },
    { merge: true }
  );

  const settingsRef = doc(db, "streamers", streamerId, "settings", "main");
  const settingsSnap = await getDoc(settingsRef);
  if (!settingsSnap.exists()) {
    await setDoc(
      settingsRef,
      {
        data: {},
        updated_at_iso: nowIso
      },
      { merge: true }
    );
  }

  codeBox.textContent = streamerId;
  expiresBox.textContent = "One-time code қажет емес. Desktop-та осы streamer_id қолданыңыз.";
  setStatus("Профиль сақталды. Енді /s/<streamer_id>/ URL арқылы admin/widget ашуға болады.");
}

function bindAuthButtons() {
  document.getElementById("auth-signup").addEventListener("click", async () => {
    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        throw new Error("Email және password толтырыңыз");
      }
      await createUserWithEmailAndPassword(auth, email, password);
      setStatus("Аккаунт ашылды. Енді Sign in күйінде профиль сақтай аласыз.");
    } catch (error) {
      setStatus(error.message || "Sign up қатесі", true);
    }
  });

  document.getElementById("auth-signin").addEventListener("click", async () => {
    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        throw new Error("Email және password толтырыңыз");
      }
      await signInWithEmailAndPassword(auth, email, password);
      setStatus("Sign in сәтті");
    } catch (error) {
      setStatus(error.message || "Sign in қатесі", true);
    }
  });

  document.getElementById("auth-signout").addEventListener("click", async () => {
    try {
      await signOut(auth);
      setStatus("Sign out жасалды");
    } catch (error) {
      setStatus(error.message || "Sign out қатесі", true);
    }
  });

  document.getElementById("create-code").addEventListener("click", async () => {
    try {
      await saveStreamerProfile();
    } catch (error) {
      setStatus(error.message || "Профиль сақтау қатесі", true);
    }
  });
}

function init() {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    setStatus("web/firebase-config.js ішінде Firebase config орнатыңыз", true);
    return;
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  initAnalytics(app);
  auth = getAuth(app);
  db = getFirestore(app);
  bindAuthButtons();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      setStatus(`Кірді: ${user.email || user.uid}`);
      if (!streamerIdInput.value.trim()) {
        streamerIdInput.value = normalizeStreamerId(user.uid);
      }
      if (!displayNameInput.value.trim()) {
        displayNameInput.value = user.email || "Streamer";
      }
      return;
    }
    setStatus("Sign in жасаңыз, содан кейін streamer profile сақтаңыз");
  });
}

init();
