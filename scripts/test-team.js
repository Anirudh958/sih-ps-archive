// node scripts/test-team.js — checks the team password/name rules and the seat-cap SQL.
import assert from "node:assert/strict";
import fs from "node:fs";
import { hashPassword, readName, verifyPassword } from "../api/team.js";

const stored = hashPassword("hunter2222");
assert.ok(verifyPassword("hunter2222", stored), "correct password must verify");
assert.ok(!verifyPassword("hunter2223", stored), "wrong password must fail");
assert.ok(!verifyPassword("hunter2222", "garbage"), "malformed hash must fail, not throw");
assert.notEqual(hashPassword("hunter2222"), stored, "salt must differ per hash");

assert.equal(readName("  Team   Alpha ", 3, 40), "Team Alpha", "trims and collapses whitespace");
assert.equal(readName("ab", 3, 40), "", "too short rejected");
assert.equal(readName("x".repeat(41), 3, 40), "", "too long rejected");
assert.equal(readName("<script>", 3, 40), "", "punctuation outside allowlist rejected");
assert.equal(readName("Vignesh R.", 2, 40), "Vignesh R.", "dots allowed");

// Seat guard must count only live members and let an existing member re-submit.
const claim = fs.readFileSync(new URL("../api/team.js", import.meta.url), "utf8")
  .match(/UPDATE browse_sessions SET group_key[\s\S]*?RETURNING id/)[0];
assert.match(claim, /m\.revoked_at IS NULL AND m\.expires_at > NOW\(\)/, "seat count ignores dead sessions");
assert.match(claim, /group_key = \$\{teamId\} OR/, "existing member bypasses the cap");
assert.match(claim, /< \$\{TEAM_MAX_MEMBERS\}/, "cap enforced in SQL");

console.log("team logic checks passed");
