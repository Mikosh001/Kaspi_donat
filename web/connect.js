import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const statusBox = document.getElementById("status-box");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const streamerIdInput = document.getElementById("streamer-id");
const displayNameInput = document.getElementById("display-name");
const codeBox = document.getElementById("connect-code");
const expiresBox = document.getElementById("connect-expires");

const firebaseConfig = window.KAZ_FIREBASE_CONFIG || null;
const apiBase = (window.KAZ_FIREBASE_API_BASE || "/api").replace(/\/+$/, "");

let auth = null;

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

async function callApi(path, payload) {
  const user = auth?.currentUser;
  if (!user) {
    throw new Error("Алдымен Sign in жасаңыз");
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify(payload || {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
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
      setStatus("Аккаунт ашылды, енді code жасауға болады");
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
      setStatus("Sign in сәтті")
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
      const streamerId = normalizeStreamerId(streamerIdInput.value);
      const displayName = displayNameInput.value.trim();
      if (!streamerId) {
        throw new Error("Streamer ID енгізіңіз");
      }
      const data = await callApi("/cloud/create-connect-code", {
        streamer_id: streamerId,
        display_name: displayName
      });
      codeBox.textContent = data.code || "--------";
      expiresBox.textContent = data.expires_at_ms ? new Date(data.expires_at_ms).toLocaleString() : "-";
      setStatus("One-time code дайын. Desktop app-та Cloud-қа қосу бөліміне енгізіңіз.");
    } catch (error) {
      setStatus(error.message || "Code жасау қатесі", true);
    }
  });
}

function init() {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    setStatus("web/firebase-config.js ішінде Firebase config орнатыңыз", true);
    return;
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
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
    setStatus("Sign in жасаңыз, содан кейін one-time code аласыз");
  });
}

init();
