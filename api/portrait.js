import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const config = {
  runtime: "nodejs",
  includeFiles: ["private/portrait.png"],
};

export default async function handler(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const path = join(process.cwd(), "private", "portrait.png");
  if (!existsSync(path)) {
    return new Response("Not found", { status: 404 });
  }
  const body = readFileSync(path);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
