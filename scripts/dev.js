// Local dev server. Mimics the parts of Vercel's runtime this app uses so the real
// handlers in api/ can be exercised without deploying.
//   node --env-file=.env scripts/dev.js
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 3000);
const origin = `http://localhost:${port}`;
process.env.APP_ORIGIN = [process.env.APP_ORIGIN, origin].filter(Boolean).join(",");

const STATIC = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".json": "application/json" };
const ROUTES = [
  [/^\/api\/auth$/, "../api/auth.js"],
  [/^\/api\/team$/, "../api/team.js"],
  [/^\/api\/filters$/, "../api/filters.js"],
  [/^\/api\/comments$/, "../api/comments/index.js"],
  [/^\/api\/session\/refresh$/, "../api/session/refresh.js"],
  [/^\/api\/problems$/, "../api/problems/index.js"],
  [/^\/api\/problems\/([^/]+)$/, "../api/problems/[id].js", "id"],
];

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(text); } catch { return text; }
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, origin);
  response.status = (code) => { response.statusCode = code; return response; };
  response.json = (body) => { response.setHeader("Content-Type", "application/json; charset=utf-8"); response.end(JSON.stringify(body)); return response; };

  const match = ROUTES.map(([pattern, file, param]) => [pattern.exec(url.pathname), file, param]).find(([hit]) => hit);
  if (match) {
    const [hit, file, param] = match;
    request.query = Object.fromEntries(url.searchParams);
    if (param) request.query[param] = decodeURIComponent(hit[1]);
    request.body = await readBody(request);
    try {
      const { default: handler } = await import(new URL(file, import.meta.url));
      await handler(request, response);
    } catch (error) {
      console.error(`${request.method} ${url.pathname} ->`, error);
      if (!response.headersSent) response.status(500).json({ error: error.message });
    }
    console.log(`${request.method} ${url.pathname}${url.search} -> ${response.statusCode}${request.headers.cookie ? "" : "  (no cookie sent)"}`);
    if (!response.writableEnded) response.end();
    return;
  }

  // Match Vercel's rewrite: only a statement id maps to the app shell, so a real
  // asset request under that prefix is never answered with HTML.
  const asset = url.pathname === "/" || /^\/problem-statements\/[^/.]+$/.test(url.pathname)
    ? "/index.html"
    : url.pathname;
  try {
    const file = await fs.readFile(path.join(root, asset));
    response.setHeader("Content-Type", STATIC[path.extname(asset)] || "application/octet-stream");
    response.end(file);
  } catch {
    response.status(404).end("Not found");
  }
}).listen(port, () => console.log(`dev server on ${origin}`));
