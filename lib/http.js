export function json(response, status, body) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  return response.json(body);
}

export function methodNotAllowed(response, methods) {
  response.setHeader("Allow", methods.join(", "));
  return json(response, 405, { error: "Method not allowed" });
}

export function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

export function requestIp(request) {
  return (request.headers["cf-connecting-ip"] || request.headers["x-forwarded-for"] || "").split(",")[0].trim();
}

export function validOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const allowed = (process.env.APP_ORIGIN || "").split(",").map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin);
}
