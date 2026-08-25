const app = document.getElementById("app");
const form = document.getElementById("composer");
const input = document.getElementById("q");
const thread = document.getElementById("thread");
const messagesEl = document.getElementById("messages");
const sendBtn = form.querySelector(".send");

const history = [];
let busy = false;

const REVEAL_KEY = "agnetha-revealed";
let revealed = false;
let greetingConsumed = false;

function normalizePhrase(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUnlockPhrase(text) {
  return normalizePhrase(text) === "aha";
}

function loadHero() {
  const img = document.querySelector(".hero-photo");
  if (!img) return;
  const real = img.getAttribute("data-src");
  if (real && img.getAttribute("src") !== real) {
    img.setAttribute("src", real);
  }
}

function reveal() {
  if (revealed) return;
  revealed = true;
  loadHero();
  document.body.classList.add("revealed");
}

try {
  sessionStorage.removeItem(REVEAL_KEY);
} catch {
  /* private mode */
}


function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toParagraphs(text) {
  const blocks = String(text || "").trim().split(/\n{2,}/);
  if (!blocks.length || (blocks.length === 1 && !blocks[0])) return "";
  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function enterTalking() {
  if (app.classList.contains("talking")) return;
  app.classList.remove("home");
  app.classList.add("talking");
  thread.hidden = false;
  input.placeholder = "";
}

function addLine(role, text) {
  const el = document.createElement("div");
  el.className = `line ${role === "user" ? "user" : "agnetha"}`;
  el.innerHTML = toParagraphs(text);
  messagesEl.appendChild(el);
  el.scrollIntoView({ block: "end", behavior: prefersReduced() ? "auto" : "smooth" });
  return el;
}

function prefersReduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setWaiting(el, on) {
  if (on) {
    el.innerHTML = `<span class="waiting" aria-label="Agnetha is thinking"><i></i><i></i><i></i></span>`;
  }
}

function gentleError(el) {
  el.className = "line agnetha";
  el.innerHTML = toParagraphs("I cannot talk just now.");
}

async function readStream(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new Error(json.error);
      if (json.delta) {
        full += json.delta;
        onDelta(full);
      }
    }
  }
  return full;
}

async function ask(text) {
  if (busy) return;
  const content = text.replace(/\s+/g, " ").trim();
  if (!content) return;

  busy = true;
  sendBtn.disabled = true;
  enterTalking();
  addLine("user", content);
  history.push({ role: "user", content });

  const replyEl = addLine("agnetha", "");
  setWaiting(replyEl, true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });

    const type = response.headers.get("content-type") || "";
    if (!response.ok || type.includes("application/json")) {
      gentleError(replyEl);
      history.push({ role: "assistant", content: "I cannot talk just now." });
      return;
    }

    const full = await readStream(response, (soFar) => {
      replyEl.innerHTML = toParagraphs(soFar);
      replyEl.scrollIntoView({ block: "end" });
    });

    const spoken = full.trim();
    if (!spoken) {
      gentleError(replyEl);
      history.push({ role: "assistant", content: "I cannot talk just now." });
      return;
    }
    replyEl.innerHTML = toParagraphs(spoken);
    history.push({ role: "assistant", content: spoken });
  } catch {
    gentleError(replyEl);
    history.push({ role: "assistant", content: "I cannot talk just now." });
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

const WELCOME = "Hey, I'm Agnetha, Andrew's personal assistant. How can I help you?";

function unlock() {
  greetingConsumed = true;
  reveal();
  enterTalking();
  addLine("agnetha", WELCOME);
  history.push({ role: "assistant", content: WELCOME });
}

input.addEventListener("input", () => {
  if (!greetingConsumed && isUnlockPhrase(input.value)) {
    input.value = "";
    unlock();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value;
  input.value = "";
  if (!revealed) {
    if (isUnlockPhrase(text)) unlock();
    return;
  }
  if (isUnlockPhrase(text) && !greetingConsumed) {
    unlock();
  } else {
    ask(text);
  }
});

window.addEventListener("load", () => input.focus());
