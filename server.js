import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleChat } from "./lib/chat.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;

function loadEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function safePublicFile(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  let rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = resolve(PUBLIC_DIR, rel);
  const publicRoot = PUBLIC_DIR.endsWith("/") ? PUBLIC_DIR : PUBLIC_DIR + "/";
  if (!full.startsWith(publicRoot) && full !== PUBLIC_DIR) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  return full;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function toWebRequest(req) {
  const host = req.headers.host || "127.0.0.1";
  const url = `http://${host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method || "GET";
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await readBody(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function sendWebResponse(res, webRes) {
  const headers = {};
  webRes.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(webRes.status, headers);
  if (!webRes.body) {
    res.end();
    return;
  }
  const reader = webRes.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/api/chat") {
      const request = await toWebRequest(req);
      const webRes = await handleChat(request, process.env);
      await sendWebResponse(res, webRes);
      return;
    }

    const file = safePublicFile(url.pathname);
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const type = MIME[extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=86400",
    });
    res.end(readFileSync(file));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    }
    res.end(JSON.stringify({ error: "I cannot talk just now.", code: "server" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Agnetha listening on http://localhost:${PORT}`);
  if (!process.env.XAI_API_KEY) {
    console.log("No XAI_API_KEY yet — the page will load, but she cannot talk until you add one.");
  }
});
