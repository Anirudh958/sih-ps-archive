// The archive's Markdown is the source of truth for the statements: 226 files with a
// fixed shape, changed only by a commit. Reading and parsing them once per function
// instance costs a few tens of milliseconds and removes the Supabase round trip that
// made browsing slow -- the statements never differed between users, so paying the
// shared transaction pooler for them bought nothing.
//
// ponytail: 2026 only. The archive also holds 2024 and 2025, but they use a different
// id width (SIH1524, four digits) and the app's /^SIH\d{5}$/ contract assumes five.
import fs from "node:fs";

const DIR = new URL("../2026/", import.meta.url);

// Headings are optional and the data already proves it: SIH26031, SIH26032 and
// SIH26033 carry no "## Problem Statement" at all, and two files spell the heading
// "## Expected Solutions". Splitting on the headings once handles every combination
// without a regex per section.
function sections(text) {
  const found = {};
  for (const part of text.split(/^## +/m).slice(1)) {
    const breakAt = part.indexOf("\n");
    const heading = (breakAt < 0 ? part : part.slice(0, breakAt)).trim();
    found[heading] = breakAt < 0 ? "" : part.slice(breakAt + 1).trim();
  }
  return found;
}

// The metadata lines carry Markdown's trailing two-space line break, so the value is
// matched without it rather than trimmed afterwards.
function field(text, name) {
  return text.match(new RegExp(`^\\*\\*${name}:\\*\\* *(.*?) *$`, "m"))?.[1] || "";
}

function parse(file, text) {
  const parts = sections(text);
  const description = parts["Problem Statement"] || "";
  const expected = parts["Expected Solution"] || parts["Expected Solutions"] || "";
  const dataset = parts.Dataset || "";
  return {
    ps_number: file.replace(/\.md$/, ""),
    // "# SIH26001 — Title". No title in the archive contains a second em dash, so the
    // lazy match always stops at the separator.
    title: (text.match(/^# .*? — (.*)$/m)?.[1] || "").trim(),
    org: field(text, "Organization"),
    department: field(text, "Department"),
    category: field(text, "Category"),
    theme: field(text, "Theme"),
    description,
    expected_solution: expected,
    dataset,
    dataset_link: dataset.match(/https?:\/\/\S+/)?.[0] || "",
    has_dataset: Boolean(dataset),
    // Three statements have no description, so the card falls back to the expected
    // solution rather than showing an empty summary.
    summary: (description || expected).slice(0, 400),
  };
}

let cache;
let index;

export function all() {
  // Every 2026 id is SIH plus five digits, so a lexicographic filename sort is also
  // the numeric order sno is meant to express.
  cache ||= fs.readdirSync(DIR)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name, position) => ({ ...parse(name, fs.readFileSync(new URL(name, DIR), "utf8")), sno: position + 1 }));
  return cache;
}

export function byId(id) {
  index ||= new Map(all().map((problem) => [problem.ps_number, problem]));
  return index.get(id);
}
