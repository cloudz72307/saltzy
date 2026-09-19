/* ===========================================================
   SALTZY — app.js
   Tabs, game loading, chat (Firebase-ready with local fallback)
   =========================================================== */

/* -----------------------------------------------------------
   0. OPTIONAL — GLOBAL CHAT BACKEND (Firebase)
   -----------------------------------------------------------
   Fill this in with your own Firebase project's config to make
   chat truly global across every visitor's browser. Until you
   do, chat runs in "Demo mode": it still works, but only syncs
   between tabs on the SAME browser (via localStorage), not
   between different people. See README.md for full setup steps.
----------------------------------------------------------- */
/* -----------------------------------------------------------
   0. FIREBASE — GLOBAL CHAT BACKEND
   ----------------------------------------------------------- */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  query,
  limitToLast,
  onChildAdded,
  get
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC66OaliJm4mKIVAUuHOqOKDMFba3ZmJ48",
  authDomain: "saltzy-9ef44.firebaseapp.com",
  databaseURL: "YOUR_DATABASE_URL_HERE",
  projectId: "saltzy-9ef44",
  storageBucket: "saltzy-9ef44.firebasestorage.app",
  messagingSenderId: "428202952726",
  appId: "1:428202952726:web:43e2dd73fa9d7fafb60d37",
  measurementId: "G-2RBDP9QB5N"
};

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(firebaseApp);

const FIREBASE_ENABLED =
  !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);
/* -----------------------------------------------------------
   1. TABS
----------------------------------------------------------- */
const tabButtons = document.querySelectorAll(".tab-btn");
const views = {
  games: document.getElementById("view-games"),
  chat: document.getElementById("view-chat"),
  updates: document.getElementById("view-updates")
};

function activateTab(name) {
  tabButtons.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  Object.entries(views).forEach(([key, el]) => el.classList.toggle("active", key === name));

  if (name === "chat") {
    onChatTabOpened();
  }
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

activateTab("games");

/* -----------------------------------------------------------
   2. GAME STAGE — load the Unity build on demand
----------------------------------------------------------- */
const gameGridView = document.getElementById("game-grid-view");
const stageView = document.getElementById("stage-view");
const stageFrame = document.getElementById("stage-frame");
const splash = document.getElementById("unity-splash");
const splashFill = document.getElementById("splash-fill");
const splashLabel = document.getElementById("splash-label");

let gameInstance = null;
let gameLoaded = false;

function openGame() {
  gameGridView.style.display = "none";
  stageView.classList.add("active");
  splash.classList.remove("hidden");
  splashFill.style.width = "0%";
  splashLabel.textContent = "Loading Slope\u2026";

  if (gameLoaded) return; // already instantiated once — just re-show

  gameInstance = UnityLoader.instantiate("gameContainer", "Build/slope.json", {
    onProgress: function (instance, progress) {
      const pct = Math.round(progress * 100);
      splashFill.style.width = pct + "%";
      splashLabel.textContent = pct < 100 ? "Loading Slope\u2026 " + pct + "%" : "Starting\u2026";
      if (progress >= 1) {
        splash.classList.add("hidden");
      }
    },
    Module: {
      onRuntimeInitialized: function () {
        splash.classList.add("hidden");
      }
    }
  });

  gameLoaded = true;
}

function closeGame() {
  stageView.classList.remove("active");
  gameGridView.style.display = "";
}

document.getElementById("play-slope-btn").addEventListener("click", openGame);
document.getElementById("back-to-games").addEventListener("click", closeGame);

document.getElementById("fullscreen-btn").addEventListener("click", () => {
  if (stageFrame.requestFullscreen) stageFrame.requestFullscreen();
  else if (stageFrame.webkitRequestFullscreen) stageFrame.webkitRequestFullscreen();
});

/* -----------------------------------------------------------
   3. CHAT
----------------------------------------------------------- */
const NAME_KEY = "saltzy_display_name";
const LOCAL_MSGS_KEY = "saltzy_chat_messages_demo";

const nameModal = document.getElementById("name-modal");
const nameInput = document.getElementById("name-input");
const nameJoinBtn = document.getElementById("name-join-btn");
const nameError = document.getElementById("name-error");

const chatMessagesEl = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatWhoamiName = document.getElementById("chat-whoami-name");
const chatChangeNameBtn = document.getElementById("chat-change-name");
const chatModeBadge = document.getElementById("chat-mode-badge");

let displayName = localStorage.getItem(NAME_KEY) || "";
let chatInitialized = false;
let dbRef = null;
let bc = null; // BroadcastChannel for local demo sync across tabs

chatModeBadge.textContent = FIREBASE_ENABLED ? "Live" : "Demo mode \u2014 this browser only";

function onChatTabOpened() {
  if (!displayName) {
    nameModal.classList.add("active");
    nameInput.value = "";
    nameError.textContent = "";
    setTimeout(() => nameInput.focus(), 50);
  } else {
    initChatUI();
  }
}

function sanitizeName(raw) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 20);
}

function joinChat() {
  const clean = sanitizeName(nameInput.value);
  if (!clean) {
    nameError.textContent = "Enter a display name to continue.";
    return;
  }
  if (clean.length < 2) {
    nameError.textContent = "That name's a little short \u2014 try 2+ characters.";
    return;
  }
  displayName = clean;
  localStorage.setItem(NAME_KEY, displayName);
  nameModal.classList.remove("active");
  initChatUI();
}

nameJoinBtn.addEventListener("click", joinChat);
nameInput.addEventListener("keydown", e => { if (e.key === "Enter") joinChat(); });

chatChangeNameBtn.addEventListener("click", () => {
  nameModal.classList.add("active");
  nameInput.value = displayName;
  nameError.textContent = "";
  setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
});

function initChatUI() {
  chatWhoamiName.textContent = displayName;

  if (!chatInitialized) {
    chatInitialized = true;

    if (FIREBASE_ENABLED) {
      initFirebaseChat();
    } else {
      initDemoChat();
    }

    chatSendBtn.addEventListener("click", sendMessage);
    chatInput.addEventListener("keydown", e => {
      if (e.key === "Enter") sendMessage();
    });
  }
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";

  const msg = { name: displayName, text: text.slice(0, 500), ts: Date.now() };

  if (FIREBASE_ENABLED && dbRef) {
    dbRef.push(msg);
  } else {
    pushLocalMessage(msg);
  }
}

function renderMessage(msg) {
  const mine = msg.name === displayName;
  const wrap = document.createElement("div");
  wrap.className = "msg" + (mine ? " me" : "");

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  const time = new Date(msg.ts || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.innerHTML = (mine ? "" : `<b>${escapeHtml(msg.name)}</b>`) + `<span>${time}</span>`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = msg.text;

  wrap.appendChild(meta);
  wrap.appendChild(bubble);

  const wasNearBottom = chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop - chatMessagesEl.clientHeight < 120;
  const emptyState = chatMessagesEl.querySelector(".chat-empty");
  if (emptyState) emptyState.remove();

  chatMessagesEl.appendChild(wrap);
  if (wasNearBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* --- Demo mode: localStorage + BroadcastChannel (same-browser only) --- */
function loadLocalMessages() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_MSGS_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function pushLocalMessage(msg) {
  const all = loadLocalMessages();
  all.push(msg);
  while (all.length > 200) all.shift();
  localStorage.setItem(LOCAL_MSGS_KEY, JSON.stringify(all));
  renderMessage(msg);
  if (bc) bc.postMessage(msg);
}

function initDemoChat() {
  const existing = loadLocalMessages();
  if (existing.length === 0) {
    chatMessagesEl.innerHTML = `<div class="chat-empty">No messages yet. Say hi \u2014 you're the first one here.</div>`;
  } else {
    existing.slice(-100).forEach(renderMessage);
  }

  if ("BroadcastChannel" in window) {
    bc = new BroadcastChannel("saltzy-chat-demo");
    bc.onmessage = ev => renderMessage(ev.data);
  }
}

/* --- Live mode: Firebase Realtime Database ---
   Loaded lazily only if FIREBASE_ENABLED, via the compat SDK
   script tags already included in index.html. */
function initFirebaseChat() {
  firebase.initializeApp(FIREBASE_CONFIG);
  const db = firebase.database();
  dbRef = db.ref("saltzy/messages").limitToLast(100);

  dbRef.on("child_added", snap => {
    const emptyState = chatMessagesEl.querySelector(".chat-empty");
    if (emptyState) emptyState.remove();
    renderMessage(snap.val());
  });

  dbRef.once("value", snap => {
    if (!snap.exists()) {
      chatMessagesEl.innerHTML = `<div class="chat-empty">No messages yet. Say hi \u2014 you're the first one here.</div>`;
    }
  });
}

/* -----------------------------------------------------------
   4. UPDATES FEED
----------------------------------------------------------- */
const UPDATES = [
  {
    date: "September 18, 2026",
    tag: "new",
    title: "Saltzy is live",
    desc: "Welcome to Saltzy. Slope is up and playable in the Games tab, and global chat is open \u2014 pick a display name and say hi."
  },
  {
    date: "September 18, 2026",
    tag: "info",
    title: "Global chat added",
    desc: "Chat now lives in its own tab. First time in, you'll be asked for a display name \u2014 no account needed, just a name to talk under."
  },
  {
    date: "September 18, 2026",
    tag: "info",
    title: "More games coming",
    desc: "Slope is the first game on Saltzy. The Games tab is built to hold more \u2014 new additions will be announced here first."
  }
];

function renderUpdates() {
  const list = document.getElementById("updates-list");
  list.innerHTML = "";
  UPDATES.forEach(u => {
    const item = document.createElement("div");
    item.className = "update-item";
    item.innerHTML = `
      <div class="update-date">${u.date}</div>
      <div class="update-card glass">
        <span class="update-tag ${u.tag}">${u.tag.toUpperCase()}</span>
        <h3 class="update-title">${escapeHtml(u.title)}</h3>
        <p class="update-desc">${escapeHtml(u.desc)}</p>
      </div>`;
    list.appendChild(item);
  });
}

renderUpdates();
