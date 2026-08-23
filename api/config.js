import { json, methodNotAllowed } from "../lib/http.js";

export default function handler(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  if (!process.env.TURNSTILE_SITE_KEY) return json(response, 503, { error: "Turnstile is not configured" });
  return json(response, 200, { turnstileSiteKey: process.env.TURNSTILE_SITE_KEY });
}
