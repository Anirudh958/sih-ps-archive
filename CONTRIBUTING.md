# Contributing to the SIH Problem Statement Archive

Thanks for helping keep this archive accurate. 🎉

This is a **data repository**, not a software project — no build, no tests, no
dependencies. A contribution is one or more Markdown files, or a correction to an
existing one.

## Code of Conduct

This project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By
participating you're expected to uphold it. Report unacceptable behaviour via a
[GitHub issue](https://github.com/DeadIndian/sih-ps-archive/issues) or directly to
[@DeadIndian](https://github.com/DeadIndian).

## What's most useful

In rough order of value:

1. **Fill a known gap** — a published statement whose ID is listed as missing in the
   README's [Coverage & Gaps](README.md#-coverage--gaps) section.
2. **Complete 2025** — the weakest year. 135 of 142 IDs, and explicitly partial per
   [ATTRIBUTION.md](ATTRIBUTION.md).
3. **Fix a transcription error** — mojibake, a truncated section, a dropped bullet, a
   mangled URL in a `## Dataset` block.
4. **Add a future edition** when SIH 2027 publishes.

### The known gaps

**2024** — `1551 1552 1553 1634 1635 1636 1662 1663 1665 1713 1763 1766 1769`

**2025** — `25078 25086 25087 25088 25089 25105 25106`

**2026** — none, complete.

Some of these were withdrawn upstream and genuinely don't exist. If you determine that
about a specific ID, say so in an issue — that's a useful contribution too, and it
saves the next person the search.

## The file format

**One statement per file. One file per statement. Named for its official ID.**

- Path: `YEAR/SIHxxxx.md` — `2024/SIH1524.md`, `2025/SIH25001.md`, `2026/SIH26001.md`
- 2024 uses bare 4-digit IDs. 2025 and 2026 prefix the year.
- UTF-8, LF line endings, trailing newline.

```markdown
# SIH26001 — AI-Based early warning and landslide Risk Monitoring System in NER

**Organization:** Ministry of Development of North Eastern Region (MDoNER)  
**Department:** Ministry of Development of North Eastern Region (MDoNER)  
**Category:** Software  
**Theme:** Disaster Management

## Problem Statement

<full published text>

## Expected Solution

<full published text, if the sponsor supplied one>

## Dataset

<URL, if the sponsor supplied one>
```

**Rules that matter:**

- The `H1` is `# <ID> — <official title>`, separated by an **em dash** (`—`), not a hyphen.
- All four metadata lines are required, in that exact order, each ending with **two
  trailing spaces** (that's what renders them as separate lines).
- `**Category:**` is exactly `Software` or `Hardware`. Nothing else.
- `**Theme:**` must be one of the 18 official themes already present in the archive.
  Check an existing file rather than inventing a spelling.
- `## Problem Statement` is expected but **not** universal — three 2026 files legitimately
  lack it because it was published that way. Don't invent one to fill the hole.
- Sections beyond these five don't belong. Don't add `## Notes`, `## Analysis`, or
  your own commentary.

## Transcribe, don't improve

This is the core rule. **Reproduce the text as published.**

✅ **Do normalise:** Markdown structure, whitespace, stray HTML/markup, character
encoding errors (mojibake like `â€™` → `'`).

❌ **Do not:** reword, summarise, expand, fix the sponsor's grammar, correct a
mislabelled `Theme`, translate, or "clean up" bullet formatting. Sponsors paste from
Word and use `•` bullets — leave them.

If a statement is filed under an obviously wrong theme, that's the source's error and
it stays. The archive's value is that it's faithful. Note the oddity in your PR
description instead.

## Nothing but Markdown

[`.gitignore`](.gitignore) deliberately blocks scripts, JSON, CSV, PDFs, scraped HTML
and scratch data. If you wrote a scraper to generate your contribution, **keep the
scraper in your own repo** and submit only the resulting `.md` files. Link your tooling
in the PR description if it's useful to others.

## Submitting

```bash
git clone https://github.com/DeadIndian/sih-ps-archive.git
cd sih-ps-archive
git checkout -b add-2025-gaps
# add or edit YEAR/SIHxxxx.md
```

Before opening the PR, sanity-check your files:

```bash
# every file you touched has all four metadata fields (expect 4 per file)
grep -c '^\*\*\(Organization\|Department\|Category\|Theme\):\*\*' 2025/SIH25078.md

# Category is one of the two valid values
grep -h '^\*\*Category:\*\*' 2025/*.md | sort -u

# your Theme spelling already exists in the archive
grep -h '^\*\*Theme:\*\*' 2024/*.md 2025/*.md 2026/*.md | sort -u

# filename matches the ID in the H1
for f in 2025/*.md; do
  grep -q "^# $(basename "$f" .md) —" "$f" || echo "MISMATCH: $f"
done
```

In the PR description, state **where the text came from** — the sih.gov.in listing, an
official PDF export, another archive. Provenance is the whole point of this repository;
a contribution without a source can't be verified and probably won't be merged.

## Attribution

Contributions must be text you're entitled to redistribute. If your source carries its
own license (as the 2026 data does — CC BY 4.0, © Vedant Chalke), say so in the PR so
it can be recorded in [ATTRIBUTION.md](ATTRIBUTION.md).

## Questions?

Open an [issue](https://github.com/DeadIndian/sih-ps-archive/issues). Questions about
whether something belongs here are welcome before you do the work, not after.
