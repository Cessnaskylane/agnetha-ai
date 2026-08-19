import { handleChat } from "../../lib/chat.mjs";

export async function onRequestPost(context) {
  return handleChat(context.request, context.env);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}
