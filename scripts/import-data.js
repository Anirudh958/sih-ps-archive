import fs from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before importing data");
const sql = neon(process.env.DATABASE_URL);
const schema = await fs.readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
for (const statement of schema.split(";").map((part) => part.trim()).filter(Boolean)) await sql.query(statement);

const problems = JSON.parse(await fs.readFile(new URL("../ps.json", import.meta.url), "utf8"));
const competitionScore = { Low: 1, Medium: 2, High: 3, "Very High": 4 };

for (const problem of problems) {
  const summary = problem.problem_decode?.plain_summary || problem.description || problem.background || "";
  const search = [problem.ps_number, problem.title, problem.org, problem.category, problem.theme, problem.background, problem.description, summary, ...(problem.expected_solution_bullets || [])].join(" ");
  await sql`INSERT INTO problem_statements
    (ps_number, sno, title, org, category, theme, summary, innovation, effort, verdict, verdict_score, competition_score, has_dataset, search_text, data)
    VALUES (${problem.ps_number}, ${problem.sno}, ${problem.title}, ${problem.org}, ${problem.category}, ${problem.theme}, ${summary},
      ${problem.innovation_scope?.tier || "Incremental"}, ${problem.invention_effort?.tier || "High"}, ${problem.verdict?.tier || "YELLOW"},
      ${problem.verdict?.score || 0}, ${competitionScore[problem.competitive_landscape?.tier] || 9}, ${Boolean(problem.dataset_link)},
      TO_TSVECTOR('english', ${search}), ${JSON.stringify(problem)})
    ON CONFLICT (ps_number) DO UPDATE SET
      sno = EXCLUDED.sno, title = EXCLUDED.title, org = EXCLUDED.org, category = EXCLUDED.category, theme = EXCLUDED.theme,
      summary = EXCLUDED.summary, innovation = EXCLUDED.innovation, effort = EXCLUDED.effort, verdict = EXCLUDED.verdict,
      verdict_score = EXCLUDED.verdict_score, competition_score = EXCLUDED.competition_score, has_dataset = EXCLUDED.has_dataset,
      search_text = EXCLUDED.search_text, data = EXCLUDED.data`;
}

console.log(`Imported ${problems.length} problem statements.`);
