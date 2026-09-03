// The whole 2026 list in one public response. Identical for every visitor, so it is
// edge-cached rather than rebuilt per request, and it no longer needs a session: the
// statements are public Markdown in this repository.
//
// ponytail: no pagination, no server-side filtering. The client has always downloaded
// the full list and filtered it in the browser, so the SQL filter branch this replaces
// was unreachable code. Add paging back when the corpus outgrows one response.
import { methodNotAllowed } from "../../lib/http.js";
import { all } from "../../lib/statements.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const items = all();
  response.status(200);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  return response.json({ items, total: items.length });
}
