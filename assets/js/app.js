/* ===========================================================
   SALTZY — app.js
   Tabs, game loading, chat, updates
   =========================================================== */


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
  tabButtons.forEach(b =>
    b.classList.toggle("active", b.dataset.tab === name)
  );

  Object.entries(views).forEach(([key, el]) =>
    el.classList.toggle("active", key === name)
  );

  if (name === "chat") {
    onChatTabOpened();
  }
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    activateTab(btn.dataset.tab);
  });
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
  splashLabel.textContent = "Loading Slope…";

  if (gameLoaded) return;

  gameInstance = UnityLoader.instantiate(
    "gameContainer",
    "Build/slope.json",
    {
      onProgress: function (instance, progress) {
        const pct = Math.round(progress * 100);

        splashFill.style.width = pct + "%";

        splashLabel.textContent =
          pct < 100
            ? "Loading Slope… " + pct + "%"
            : "Starting…";

        if (progress >= 1) {
          splash.classList.add("hidden");
        }
      },

      Module: {
        onRuntimeInitialized: function () {
          splash.classList.add("hidden");
        }
      }
    }
  );

  gameLoaded = true;
}

function closeGame() {
  stageView.classList.remove("active");
  gameGridView.style.display = "";
}

document
  .getElementById("play-slope-btn")
  .addEventListener("click", openGame);

document
  .getElementById("back-to-games")
  .addEventListener("click", closeGame);

document
  .getElementById("fullscreen-btn")
  .addEventListener("click", () => {
    if (stageFrame.requestFullscreen) {
      stageFrame.requestFullscreen();
    } else if (stageFrame.webkitRequestFullscreen) {
      stageFrame.webkitRequestFullscreen();
    }
  });


/* -----------------------------------------------------------
   3. CHAT — ntfy.sh global chat
----------------------------------------------------------- */

// ntfy server + room
const NTFY_BASE = "https://ntfy.sh";
const CHAT_TOPIC = "9rYuTBZN0evM2phm";

const NAME_KEY = "saltzy_display_name";

// DOM elements
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
let sseSource = null;

chatModeBadge.textContent = "Connecting…";


/* -----------------------------------------------------------
   OPEN CHAT TAB
----------------------------------------------------------- */

function onChatTabOpened() {
  if (!displayName) {
    nameModal.classList.add("active");

    nameInput.value = "";
    nameError.textContent = "";

    setTimeout(() => {
      nameInput.focus();
    }, 50);
  } else {
    initChatUI();
  }
}


/* -----------------------------------------------------------
   DISPLAY NAME
----------------------------------------------------------- */

function sanitizeName(raw) {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

function joinChat() {
  const clean = sanitizeName(nameInput.value);

  if (!clean) {
    nameError.textContent =
      "Enter a display name to continue.";
    return;
  }

  if (clean.length < 2) {
    nameError.textContent =
      "That name's a little short — try 2+ characters.";
    return;
  }

  displayName = clean;

  localStorage.setItem(NAME_KEY, displayName);

  nameModal.classList.remove("active");

  initChatUI();
}

nameJoinBtn.addEventListener("click", joinChat);

nameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    joinChat();
  }
});


/* -----------------------------------------------------------
   CHANGE NAME
----------------------------------------------------------- */

chatChangeNameBtn.addEventListener("click", () => {
  nameModal.classList.add("active");

  nameInput.value = displayName;
  nameError.textContent = "";

  setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 50);
});


/* -----------------------------------------------------------
   INITIALIZE CHAT UI
----------------------------------------------------------- */

function initChatUI() {
  chatWhoamiName.textContent = displayName;

  if (chatInitialized) return;

  chatInitialized = true;

  initNtfyChat();

  chatSendBtn.addEventListener("click", sendMessage);

  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
}


*/ -----------------------------------------------------------
   SEND MESSAGE
----------------------------------------------------------- */

async function sendMessage() {
  const text = chatInput.value.trim();

  if (!text) return;

  chatInput.value = "";

  const msg = {
    name: displayName,
    text: text.slice(0, 500),
    ts: Date.now()
  };

  try {
    const response = await fetch(
      `${NTFY_BASE}/${CHAT_TOPIC}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "text/plain"
        },

        body: JSON.stringify(msg)
      }
    );

    if (!response.ok) {
      throw new Error(
        `ntfy returned HTTP ${response.status}`
      );
    }

  } catch (err) {
    console.error(
      "Saltzy chat: failed to send",
      err
    );

    chatInput.value = text;

    renderSystemNote(
      "Couldn't send that — check your connection and try again."
    );
  }
}


/* -----------------------------------------------------------
   RENDER MESSAGE
----------------------------------------------------------- */

function renderMessage(msg) {
  if (!msg || typeof msg !== "object") return;

  const mine = msg.name === displayName;

  const wrap = document.createElement("div");

  wrap.className =
    "msg" + (mine ? " me" : "");

  const meta = document.createElement("div");

  meta.className = "msg-meta";

  const time = new Date(
    msg.ts || Date.now()
  ).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  if (!mine) {
    const name = document.createElement("b");

    name.textContent =
      msg.name || "Unknown";

    meta.appendChild(name);
  }

  const timeEl = document.createElement("span");

  timeEl.textContent = time;

  meta.appendChild(timeEl);

  const bubble = document.createElement("div");

  bubble.className = "msg-bubble";

  bubble.textContent =
    msg.text || "";

  wrap.appendChild(meta);
  wrap.appendChild(bubble);

  const wasNearBottom =
    chatMessagesEl.scrollHeight -
    chatMessagesEl.scrollTop -
    chatMessagesEl.clientHeight < 120;

  clearEmptyState();

  chatMessagesEl.appendChild(wrap);

  if (wasNearBottom) {
    chatMessagesEl.scrollTop =
      chatMessagesEl.scrollHeight;
  }
}


/* -----------------------------------------------------------
   SYSTEM MESSAGE
----------------------------------------------------------- */

function renderSystemNote(text) {
  const note = document.createElement("div");

  note.className = "chat-empty";
  note.textContent = text;

  chatMessagesEl.appendChild(note);

  chatMessagesEl.scrollTop =
    chatMessagesEl.scrollHeight;
}


/* -----------------------------------------------------------
   CLEAR EMPTY STATE
----------------------------------------------------------- */

function clearEmptyState() {
  const emptyState =
    chatMessagesEl.querySelector(".chat-empty");

  if (emptyState) {
    emptyState.remove();
  }
}


/* -----------------------------------------------------------
   LOAD CHAT HISTORY
----------------------------------------------------------- */

async function loadChatHistory() {
  try {
    const url =
      `${NTFY_BASE}/${CHAT_TOPIC}/json?poll=1&since=12h`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `ntfy returned HTTP ${response.status}`
      );
    }

    const rawText =
      await response.text();

    const lines = rawText
      .trim()
      .split("\n")
      .filter(Boolean);

    const messages = [];

    for (const line of lines) {
      try {
        const envelope =
          JSON.parse(line);

        if (
          envelope.event === "message" &&
          envelope.message
        ) {
          try {
            const msg =
              JSON.parse(envelope.message);

            if (
              msg &&
              typeof msg === "object" &&
              msg.text
            ) {
              messages.push(msg);
            }

          } catch {
            // Ignore invalid Saltzy messages
          }
        }

      } catch {
        // Ignore malformed lines
      }
    }

    chatMessagesEl.innerHTML = "";

    if (messages.length === 0) {
      renderSystemNote(
        "No messages yet. Say hi — you're the first one here."
      );

      return;
    }

    messages
      .slice(-100)
      .forEach(renderMessage);

  } catch (err) {
    console.error(
      "Saltzy chat: failed to load history",
      err
    );

    chatMessagesEl.innerHTML = "";

    renderSystemNote(
      "Couldn't load chat history, but you can still send messages."
    );
  }
}


/* -----------------------------------------------------------
   LIVE CHAT — SERVER SENT EVENTS
----------------------------------------------------------- */

function subscribeChatLive() {
  if (sseSource) return;

  const url =
    `${NTFY_BASE}/${CHAT_TOPIC}/sse`;

  console.log(
    "Saltzy chat: connecting to",
    url
  );

  sseSource =
    new EventSource(url);

  sseSource.onopen = () => {
    console.log(
      "Saltzy chat: connected"
    );

    chatModeBadge.textContent =
      "Live";

    chatModeBadge.style.color = "";
  };

  sseSource.onmessage = event => {
    try {
      const envelope =
        JSON.parse(event.data);

      if (
        envelope.event !== "message" ||
        !envelope.message
      ) {
        return;
      }

      const msg =
        JSON.parse(envelope.message);

      if (
        !msg ||
        typeof msg !== "object"
      ) {
        return;
      }

      if (!msg.text) {
        return;
      }

      clearEmptyState();

      renderMessage(msg);

    } catch (err) {
      console.warn(
        "Saltzy chat: ignored malformed event",
        err
      );
    }
  };

  sseSource.onerror = err => {
    console.warn(
      "Saltzy chat: connection error",
      err
    );

    chatModeBadge.textContent =
      "Reconnecting…";

    chatModeBadge.style.color =
      "var(--danger)";
  };
}


/* -----------------------------------------------------------
   INITIALIZE NTFY CHAT
----------------------------------------------------------- */

async function initNtfyChat() {
  chatModeBadge.textContent =
    "Loading…";

  await loadChatHistory();

  subscribeChatLive();
}


/* -----------------------------------------------------------
   HTML ESCAPING
----------------------------------------------------------- */

function escapeHtml(str) {
  const div =
    document.createElement("div");

  div.textContent = str;

  return div.innerHTML;
}


/* -----------------------------------------------------------
   4. UPDATES FEED
----------------------------------------------------------- */

const UPDATES = [
  {
    date: "September 18, 2026",
    tag: "new",
    title: "Saltzy is live",
    desc: "Welcome to Saltzy. Slope is up and playable in the Games tab, and global chat is open — pick a display name and say hi."
  },

  {
    date: "September 18, 2026",
    tag: "info",
    title: "Global chat added",
    desc: "Chat now lives in its own tab. First time in, you'll be asked for a display name — no account needed, just a name to talk under."
  },

  {
    date: "September 18, 2026",
    tag: "info",
    title: "More games coming",
    desc: "Slope is the first game on Saltzy. The Games tab is built to hold more — new additions will be announced here first."
  }
];

function renderUpdates() {
  const list =
    document.getElementById("updates-list");

  list.innerHTML = "";

  UPDATES.forEach(u => {
    const item =
      document.createElement("div");

    item.className =
      "update-item";

    item.innerHTML = `
      <div class="update-date">${u.date}</div>

      <div class="update-card glass">
        <span class="update-tag ${u.tag}">
          ${u.tag.toUpperCase()}
        </span>

        <h3 class="update-title">
          ${escapeHtml(u.title)}
        </h3>

        <p class="update-desc">
          ${escapeHtml(u.desc)}
        </p>
      </div>
    `;

    list.appendChild(item);
  });
}

renderUpdates();
```
