import { db } from "../../lib/db.js";
import { json, methodNotAllowed } from "../../lib/http.js";
import { consumeRateLimit, verifyAccess } from "../../lib/session.js";

const allowed = {
  category: ["Software", "Hardware"],
  quick: ["dataset", "starred"],
};

function psSearchCandidates(value) {
  const raw = String(value || "").trim().toUpperCase();
  const digits = raw.replace(/\D/g, "");
  const candidates = new Set();
  if (/^SIH\d{5}$/.test(raw)) candidates.add(raw);
  if (/^\d{5}$/.test(digits)) candidates.add(`SIH${digits}`);
  // Common shorthand/typo: users sometimes type a 6-digit year-prefixed form like
  // 262001 when they mean SIH26001. Keep the first two digits and last three digits.
  if (/^26\d{4}$/.test(digits)) candidates.add(`SIH${digits.slice(0, 2)}${digits.slice(3)}`);
  return [...candidates];
}

// The 229 official statements are the same for every signed-in user and only change
// when the importer runs, so a warm function answers ?all=1 with no database round
// trip at all. That is what removed the per-page latency from browsing.
// ponytail: process-lifetime cache, no invalidation -- redeploy (or wait for the
// function to recycle) after re-importing. Add a version check if imports get frequent.
let allStatements;

export default async function handler(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const session = await verifyAccess(request);
  if (!session) return json(response, 401, { error: "Access token required" });
  if (!await consumeRateLimit(session.sessionId, "list", 60, 60)) return json(response, 429, { error: "Too many requests" });

  if (request.query.all) {
    allStatements ||= (await db()`SELECT data FROM problem_statements ORDER BY sno ASC`).map((row) => row.data);
    return json(response, 200, { items: allStatements, total: allStatements.length });
  }

  const page = Math.max(1, Number.parseInt(request.query.page || "1", 10) || 1);
  const pageSize = 12;
  const values = [];
  const clauses = [];
  const add = (clause, value) => { values.push(value); clauses.push(clause.replace("?", `$${values.length}`)); };
  const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const exact = (name) => allowed[name].includes(request.query[name]) ? request.query[name] : "";

  const search = text(request.query.search, 80);
  if (search) {
    const ids = psSearchCandidates(search);
    if (ids.length) {
      values.push(ids, search);
      clauses.push(`(ps_number = ANY($${values.length - 1}) OR search_text @@ websearch_to_tsquery('english', $${values.length}))`);
    } else add("search_text @@ websearch_to_tsquery('english', ?)", search);
  }
  const theme = text(request.query.theme, 100);
  if (theme) add("theme = ?", theme);
  const org = text(request.query.org, 160);
  if (org) add("org = ?", org);
  const category = exact("category");
  if (category) add("category = ?", category);
  const from = Math.max(1, Number.parseInt(request.query.from || "", 10) || 0);
  const to = Math.min(99999, Number.parseInt(request.query.to || "", 10) || 0);
  if (from) add("sno >= ?", from);
  if (to) add("sno <= ?", to);
  const quick = exact("quick");
  if (quick === "dataset") clauses.push("has_dataset = TRUE");
  if (quick === "starred") {
    const ids = text(request.query.ids, 1200).split(",").filter((id) => /^SIH\d{5}$/.test(id)).slice(0, 100);
    if (!ids.length) clauses.push("FALSE");
    else add("ps_number = ANY(?)", ids);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;
  values.push(pageSize, offset);
  const sql = db();
  const query = `SELECT ps_number, title, org, category, theme, summary, innovation, effort, has_dataset
    FROM problem_statements ${where} ORDER BY sno ASC LIMIT $${values.length - 1} OFFSET $${values.length}`;
  const countQuery = `SELECT COUNT(*)::int AS total FROM problem_statements ${where}`;
  const [items, counts] = await Promise.all([sql.query(query, values), sql.query(countQuery, values.slice(0, -2))]);
  return json(response, 200, { items, total: counts[0].total, page, pageSize, hasMore: offset + items.length < counts[0].total });
}
