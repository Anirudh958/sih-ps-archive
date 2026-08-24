import { endSession, signInUser, signUpUser, verifyAccess } from "../lib/session.js";
import { json, methodNotAllowed, requestIp, validOrigin } from "../lib/http.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!validOrigin(request)) return json(response, 403, { error: "Invalid origin" });

  const { action, email, password } = request.body || {};

  if (action === "logout") {
    const session = await verifyAccess(request);
    await endSession(session?.sessionId, response);
    return json(response, 200, { ok: true });
  }
  if (action !== "login" && action !== "signup") return json(response, 400, { error: "Unknown action" });

  const address = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(address) || address.length > 254) return json(response, 400, { error: "Enter a valid email address" });
  const secret = String(password ?? "");
  if (secret.length < 8 || secret.length > 72) return json(response, 400, { error: "Password must be 8 to 72 characters" });

  const metadata = { ip: requestIp(request), userAgent: request.headers["user-agent"] };
  const result = action === "signup"
    ? await signUpUser(response, address, secret, metadata)
    : await signInUser(response, address, secret, metadata);

  if (result.error) return json(response, 403, { error: result.error });
  if (result.pending) return json(response, 202, { pending: true, message: "Check your email to confirm the account, then log in." });
  return json(response, action === "signup" ? 201 : 200, result);
}
