import { db } from "../../lib/db.js";
import { json, methodNotAllowed } from "../../lib/http.js";
import { consumeRateLimit, verifyAccess } from "../../lib/session.js";

const allowed = {
  category: ["Software", "Hardware"],
  effort: ["Low", "Medium", "High"],
  innovation: ["Breakthrough", "Moderate", "Incremental"],
  quick: ["recommended", "low-effort", "dataset", "starred"],
  sort: ["recommended", "number", "innovation", "effort", "competition"],
};

export default async function handler(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const session = await verifyAccess(request);
  if (!session) return json(response, 401, { error: "Access token required" });
  if (!await consumeRateLimit(session.sessionId, "list", 60, 60)) return json(response, 429, { error: "Too many requests" });

  const page = Math.max(1, Number.parseInt(request.query.page || "1", 10) || 1);
  const pageSize = 12;
  const values = [];
  const clauses = [];
  const add = (clause, value) => { values.push(value); clauses.push(clause.replace("?", `$${values.length}`)); };
  const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const exact = (name) => allowed[name].includes(request.query[name]) ? request.query[name] : "";

  const search = text(request.query.search, 80);
  if (search) add("search_text @@ websearch_to_tsquery('english', ?)", search);
  const theme = text(request.query.theme, 100);
  if (theme) add("theme = ?", theme);
  const org = text(request.query.org, 160);
  if (org) add("org = ?", org);
  const category = exact("category");
  if (category) add("category = ?", category);
  const effort = exact("effort");
  if (effort) add("effort = ?", effort);
  const innovation = exact("innovation");
  if (innovation) add("innovation = ?", innovation);
  const verdict = ["GREEN", "YELLOW", "RED"].includes(request.query.verdict) ? request.query.verdict : "";
  if (verdict) add("verdict = ?", verdict);
  const from = Math.max(1, Number.parseInt(request.query.from || "", 10) || 0);
  const to = Math.min(99999, Number.parseInt(request.query.to || "", 10) || 0);
  if (from) add("sno >= ?", from);
  if (to) add("sno <= ?", to);
  const quick = exact("quick");
  if (quick === "recommended") clauses.push("verdict = 'GREEN'");
  if (quick === "low-effort") clauses.push("effort = 'Low'");
  if (quick === "dataset") clauses.push("has_dataset = TRUE");
  if (quick === "starred") {
    const ids = text(request.query.ids, 1200).split(",").filter((id) => /^SIH\d{5}$/.test(id)).slice(0, 100);
    if (!ids.length) clauses.push("FALSE");
    else add("ps_number = ANY(?)", ids);
  }

  const sort = exact("sort") || "recommended";
  const orders = {
    recommended: "CASE verdict WHEN 'GREEN' THEN 3 WHEN 'YELLOW' THEN 2 ELSE 1 END DESC, verdict_score DESC, sno ASC",
    number: "ps_number ASC",
    innovation: "CASE innovation WHEN 'Breakthrough' THEN 3 WHEN 'Moderate' THEN 2 ELSE 1 END DESC, sno ASC",
    effort: "CASE effort WHEN 'Low' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END ASC, sno ASC",
    competition: "competition_score ASC, sno ASC",
  };
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;
  values.push(pageSize, offset);
  const sql = db();
  const query = `SELECT ps_number, title, org, category, theme, summary, innovation, effort, verdict, has_dataset
    FROM problem_statements ${where} ORDER BY ${orders[sort]} LIMIT $${values.length - 1} OFFSET $${values.length}`;
  const countQuery = `SELECT COUNT(*)::int AS total FROM problem_statements ${where}`;
  const [items, counts] = await Promise.all([sql.query(query, values), sql.query(countQuery, values.slice(0, -2))]);
  return json(response, 200, { items, total: counts[0].total, page, pageSize, hasMore: offset + items.length < counts[0].total });
}
