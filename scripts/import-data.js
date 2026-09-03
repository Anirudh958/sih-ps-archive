import fs from "node:fs/promises";
import { db } from "../lib/db.js";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before importing data");
const sql = db();
const schema = await fs.readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
for (const statement of schema.split(";").map((part) => part.trim()).filter(Boolean)) await sql.query(statement);

const problems = JSON.parse(await fs.readFile(new URL("../ps.json", import.meta.url), "utf8"));

for (const problem of problems) {
  // The official statements carry no scoring, so summary is the first slice of the
  // official description and the legacy score columns keep their schema defaults.
  const summary = (problem.description || "").slice(0, 400);
  const search = [problem.ps_number, problem.title, problem.org, problem.department, problem.category, problem.theme, problem.description].join(" ");
  await sql`INSERT INTO problem_statements
    (ps_number, sno, title, org, category, theme, summary, innovation, effort, verdict, verdict_score, competition_score, has_dataset, search_text, data)
    VALUES (${problem.ps_number}, ${problem.sno}, ${problem.title}, ${problem.org}, ${problem.category}, ${problem.theme}, ${summary},
      ${"n/a"}, ${"n/a"}, ${"n/a"}, ${0}, ${0}, ${Boolean(problem.dataset_link)},
      TO_TSVECTOR('english', ${search}), ${JSON.stringify(problem)})
    ON CONFLICT (ps_number) DO UPDATE SET
      sno = EXCLUDED.sno, title = EXCLUDED.title, org = EXCLUDED.org, category = EXCLUDED.category, theme = EXCLUDED.theme,
      summary = EXCLUDED.summary, innovation = EXCLUDED.innovation, effort = EXCLUDED.effort, verdict = EXCLUDED.verdict,
      verdict_score = EXCLUDED.verdict_score, competition_score = EXCLUDED.competition_score, has_dataset = EXCLUDED.has_dataset,
      search_text = EXCLUDED.search_text, data = EXCLUDED.data`;
}

console.log(`Imported ${problems.length} problem statements.`);
