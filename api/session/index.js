import { issueSession } from "../../lib/session.js";
import { json, methodNotAllowed, requestIp, validOrigin } from "../../lib/http.js";
import { verifyTurnstile } from "../../lib/turnstile.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!validOrigin(request)) return json(response, 403, { error: "Invalid origin" });
  const ip = requestIp(request);
  if (!await verifyTurnstile(request.body?.turnstileToken, ip)) return json(response, 403, { error: "Human verification failed" });
  const tokens = await issueSession(response, { ip, userAgent: request.headers["user-agent"] });
  return json(response, 201, tokens);
}
