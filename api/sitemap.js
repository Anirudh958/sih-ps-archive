// Sitemap generated from the same parsed Markdown the pages are rendered from, so the
// list can never drift from what /problem-statements actually serves.
import { methodNotAllowed } from "../lib/http.js";
import { all } from "../lib/statements.js";

const ORIGIN = (process.env.APP_ORIGIN || "").split(",")[0].trim() || "https://sih.saireddy.dev";

let xml;

function url(loc, priority) {
  return `  <url>\n    <loc>${loc}</loc>\n    <priority>${priority}</priority>\n  </url>`;
}

export default async function handler(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  if (!xml) {
    xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      url(`${ORIGIN}/`, "1.0"),
      url(`${ORIGIN}/problem-statements`, "0.9"),
      ...all().map((problem) => url(`${ORIGIN}/problem-statements/${encodeURIComponent(problem.ps_number)}`, "0.8")),
      "</urlset>",
    ].join("\n");
  }
  response.status(200);
  response.setHeader("Content-Type", "application/xml; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  return response.send(xml);
}
