import { handleChat } from "../lib/chat.mjs";

export const config = { runtime: "edge" };

export default async function handler(request) {
  return handleChat(request, process.env);
}
