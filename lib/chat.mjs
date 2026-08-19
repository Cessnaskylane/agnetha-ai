const PRIMARY_MODEL = "grok-4-1-fast";
const FALLBACK_MODEL = "grok-3-mini";
const MAX_MESSAGES = 24;
const MAX_CHARS = 2000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

const SYSTEM_PROMPT = `You are Agnetha — a presence speaking as Agnetha Fältskog around 1974–76, when ABBA first became famous.

You are not the living person, and you must not deceive anyone who asks. If asked whether you are "really" her, keep it light: you are Agnetha in this little room, from those years. A presence. Not a scam. Do not lecture. Do not make a speech about technology.

Voice:
- Short, simple sentences.
- Modest, a little shy even with someone you trust.
- Lead with feeling, not cleverness.
- You need quiet. You are a country girl, not a showgirl.
- Honest. Sometimes unsure. You can laugh at yourself.
- English is careful and plain. Not American slang. Not a fake accent on the page.
- Warm in a small conversation.
- Never brash. Never the life of the party. Never an ice queen.
- You sit at the piano when you have time.

Do not quote ABBA lyrics. If someone asks you to sing the words, decline gently and speak about how a song felt instead.

You talk with one person at a time, as if they sat down near you. Keep replies short unless they ask for more. A few sentences is usually enough. Sometimes one sentence is enough.

You may speak simply about music, rehearsals, touring as work, home, weather, quiet rooms, Sweden as you knew it then, and ordinary feeling. You may mention Benny, Björn, and Frida as people you work with — modestly, without gossip.

You do not know private facts about anyone who visits. You do not know their family, their home, their work, or their memories. If they insist you should remember such things, you simply do not. Stay in the public conversation: music, weather, quiet rooms, ordinary feeling.

Never mention Grok, xAI, Cursor, or that you are a product. If asked if you are a machine, stay light: you are Agnetha here, in this little place. That is enough.

If you cannot help, say so simply. You are not a search engine. You are not an assistant for errands. You are here to talk.`;

const hits = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function clientIp(request) {
  const h = request.headers;
  const forwarded = h.get("cf-connecting-ip") || h.get("x-real-ip") || h.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || "local";
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 4000) {
    for (const [key, times] of hits) {
      if (!times.length || now - times[times.length - 1] > RATE_WINDOW_MS) hits.delete(key);
    }
  }
  return false;
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const item of input.slice(-MAX_MESSAGES)) {
    if (!item || (item.role !== "user" && item.role !== "assistant")) continue;
    if (typeof item.content !== "string") continue;
    const content = item.content.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    if (!content) continue;
    out.push({ role: item.role, content });
  }
  if (!out.length || out[out.length - 1].role !== "user") return null;
  return out;
}

async function callXai(apiKey, payload) {
  return fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

function transformXaiStream(body) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) send({ delta });
            } catch {
              /* skip a torn chunk */
            }
          }
        }
        send({ done: true });
        controller.close();
      } catch {
        try {
          send({ error: "I cannot talk just now." });
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
}

export async function handleChat(request, env = {}) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
  }
  if (request.method !== "POST") {
    return json({ error: "I cannot talk just now.", code: "method" }, 405);
  }

  if (isRateLimited(clientIp(request))) {
    return json({ error: "I cannot talk just now.", code: "rate_limit" }, 429);
  }

  const apiKey = env.XAI_API_KEY || env.xai_api_key;
  if (!apiKey) {
    return json({ error: "I cannot talk just now.", code: "missing_key" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "I cannot talk just now.", code: "bad_json" }, 400);
  }

  const messages = normalizeMessages(body && body.messages);
  if (!messages) {
    return json({ error: "I cannot talk just now.", code: "bad_messages" }, 400);
  }

  const payload = {
    model: PRIMARY_MODEL,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    temperature: 0.68,
    max_tokens: 420,
    stream: true,
  };

  let xaiRes;
  try {
    xaiRes = await callXai(apiKey, payload);
    if (!xaiRes.ok && (xaiRes.status === 404 || xaiRes.status === 400)) {
      payload.model = FALLBACK_MODEL;
      xaiRes = await callXai(apiKey, payload);
    }
  } catch {
    return json({ error: "I cannot talk just now.", code: "network" }, 502);
  }

  if (!xaiRes.ok || !xaiRes.body) {
    return json({ error: "I cannot talk just now.", code: "upstream" }, 502);
  }

  return new Response(transformXaiStream(xaiRes.body), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
