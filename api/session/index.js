import { issueSession } from "../../lib/session.js";
import { json, methodNotAllowed, requestIp, validOrigin } from "../../lib/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!validOrigin(request)) return json(response, 403, { error: "Invalid origin" });
  const ip = requestIp(request);
  const tokens = await issueSession(response, { ip, userAgent: request.headers["user-agent"] });
  if (tokens.error) return json(response, 403, { error: tokens.error });
  return json(response, 201, tokens);
}
