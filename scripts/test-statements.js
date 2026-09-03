// node scripts/test-statements.js — the Markdown parser that replaced the statements
// table. No database, no network: it reads the 226 files in 2026/ and asserts the
// shape every request path downstream depends on.
import assert from "node:assert/strict";
import { all, byId } from "../lib/statements.js";

const problems = all();

assert.equal(problems.length, 226, "every 2026 statement is parsed");
assert.equal(all(), problems, "second call returns the cached array, not a re-read");

const ids = new Set(problems.map((problem) => problem.ps_number));
assert.equal(ids.size, problems.length, "ps_number is unique");

for (const problem of problems) {
  const where = problem.ps_number;
  assert.match(problem.ps_number, /^SIH\d{5}$/, `${where}: id shape is the app's contract`);
  // A blank title, org, category or theme would render as an empty card and an empty
  // <title> tag, so each is required rather than defaulted.
  assert.ok(problem.title, `${where}: has a title`);
  assert.ok(problem.org, `${where}: has an organisation`);
  assert.ok(problem.department, `${where}: has a department`);
  assert.ok(["Software", "Hardware"].includes(problem.category), `${where}: category is Software or Hardware`);
  assert.ok(problem.theme, `${where}: has a theme`);
  assert.ok(problem.summary, `${where}: has a summary to show on the card`);
  assert.ok(problem.summary.length <= 400, `${where}: summary is clipped`);
  // The em dash separator must not survive into the title, and the metadata lines must
  // not keep Markdown's trailing two spaces.
  assert.doesNotMatch(problem.title, /^SIH\d{5}/, `${where}: id stripped from the title`);
  assert.equal(problem.org, problem.org.trim(), `${where}: organisation has no trailing markup`);
  assert.equal(problem.theme, problem.theme.trim(), `${where}: theme has no trailing markup`);
}

// sno is what the list is ordered by, so it has to be contiguous and in id order.
assert.deepEqual(
  problems.map((problem) => problem.sno),
  problems.map((_, position) => position + 1),
  "sno runs 1..226 without a gap",
);
assert.deepEqual(
  problems.map((problem) => problem.ps_number),
  [...problems.map((problem) => problem.ps_number)].sort(),
  "statements come out in id order",
);

// SIH26031 was published with the whole brief in its title and no Problem Statement
// section at all. It is the case that breaks a parser assuming the section exists.
const noDescription = byId("SIH26031");
assert.ok(noDescription, "SIH26031 parses");
assert.equal(noDescription.description, "", "SIH26031 has no Problem Statement section");
assert.ok(noDescription.expected_solution, "SIH26031 still carries its Expected Solution");
assert.equal(noDescription.summary, noDescription.expected_solution.slice(0, 400), "summary falls back to the expected solution");

// Two files spell the heading "Expected Solutions". Both spellings land in one field.
assert.ok(
  problems.filter((problem) => problem.expected_solution).length > 100,
  "the Expected Solution section is picked up across the corpus",
);

const withDataset = byId("SIH26038");
assert.ok(withDataset.has_dataset, "SIH26038 has a dataset");
assert.match(withDataset.dataset_link, /^https?:\/\//, "the first URL in the section becomes the link");
assert.ok(
  problems.some((problem) => !problem.has_dataset),
  "statements without a dataset are flagged as such, not dropped",
);

assert.equal(byId("SIH26001").ps_number, "SIH26001", "lookup by id works");
assert.equal(byId("SIH99999"), undefined, "unknown id is undefined, not a throw");

console.log(`statement parser checks passed (${problems.length} statements)`);
