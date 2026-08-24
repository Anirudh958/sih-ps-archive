<div align="center">

# 🇮🇳 SIH Problem Statement Archive

### Every Smart India Hackathon problem statement from 2024, 2025 and 2026 — one file each, plain Markdown, no login wall.

The official SIH portal publishes its problem statements, then replaces them next season.
This repository keeps them. **607 problem statements** from **82 organisations**,
**189,240 words** of ministry-authored engineering briefs, frozen as `SIHxxxx.md`
and greppable from your terminal.

[![Problem Statements](https://img.shields.io/badge/problem%20statements-607-0f766e?style=for-the-badge)](#-whats-inside)
[![Years](https://img.shields.io/badge/years-2024%20·%202025%20·%202026-1d4ed8?style=for-the-badge)](#-whats-inside)
[![Format](https://img.shields.io/badge/format-Markdown-000000?style=for-the-badge&logo=markdown&logoColor=white)](#-anatomy-of-a-problem-statement)

[![Software](https://img.shields.io/badge/Software-440-2563eb?style=flat-square)](#-the-softwarehardware-split)
[![Hardware](https://img.shields.io/badge/Hardware-167-7c3aed?style=flat-square)](#-the-softwarehardware-split)
[![Themes](https://img.shields.io/badge/themes-18-be185d?style=flat-square)](#-themes-across-three-years)
[![Text](https://img.shields.io/badge/text-original%20authors-64748b?style=flat-square)](ATTRIBUTION.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-16a34a?style=flat-square)](CONTRIBUTING.md)
[![Stars](https://img.shields.io/github/stars/DeadIndian/sih-ps-archive?style=flat-square&color=eab308)](https://github.com/DeadIndian/sih-ps-archive/stargazers)

[What's Inside](#-whats-inside) ·
[Search Recipes](#-search-recipes) ·
[Coverage & Gaps](#-coverage--gaps) ·
[Data Caveats](#-data-caveats) ·
[Contribute](CONTRIBUTING.md) ·
[Attribution](ATTRIBUTION.md)

</div>

---

## 📖 Table of Contents

- [Why this exists](#-why-this-exists)
- [What's inside](#-whats-inside)
- [Anatomy of a problem statement](#-anatomy-of-a-problem-statement)
- [Search recipes](#-search-recipes)
- [Themes across three years](#-themes-across-three-years)
- [The software/hardware split](#-the-softwarehardware-split)
- [Who's asking](#-whos-asking)
- [Coverage & gaps](#-coverage--gaps)
- [Data caveats](#-data-caveats)
- [Contributing](#-contributing)
- [Attribution & reuse](#-attribution--reuse)
- [Maintainer](#-maintainer)

---

## 🎯 Why this exists

Smart India Hackathon publishes a few hundred problem statements each year, sourced
from central ministries, state governments, PSUs and private partners. Then the next
edition ships and the previous list quietly stops being browsable.

That's a loss, because the archive is more useful than any single year:

- **Teams shortlisting a PS** want to diff this year's list against the last two —
  a problem restated across three editions is a problem nobody has solved yet.
- **Anyone building a scraper, RAG index, or search UI** wants flat Markdown with
  stable filenames, not a paginated JavaScript table behind a portal.
- **Researchers** want a longitudinal record of what the Indian government asked
  engineering students to build, year over year. Disaster Management went from
  **5 statements in 2024 to 29 in 2026**. That's a policy signal sitting in a data set.

No build step. No dependencies. No database. `git clone` and `grep`.

## 📦 What's inside

```
sih-ps-archive/
├── 2024/              246 files — SIH1524 … SIH1782
├── 2025/              135 files — SIH25001 … SIH25142
├── 2026/              226 files — SIH26001 … SIH26226
├── ATTRIBUTION.md     sources, provenance, what was normalised
├── CONTRIBUTING.md    how to add a missing statement
└── README.md
```

| Year | Statements | ID range | Software | Hardware | Themes | Completeness |
| :--- | ---: | :--- | ---: | ---: | ---: | :--- |
| **2026** | **226** | `SIH26001`–`SIH26226` | 172 | 54 | 18 | ✅ Complete, no gaps |
| **2025** | **135** | `SIH25001`–`SIH25142` | 90 | 45 | 17 | ⚠️ Partial — 7 IDs missing |
| **2024** | **246** | `SIH1524`–`SIH1782` | 178 | 68 | 18 | ⚠️ 13 IDs missing |
| **Total** | **607** | — | **440** | **167** | **18** | ~96% of known IDs |

Every file is UTF-8 Markdown, `2.8 MB` on disk total, average ~312 words per statement.
The longest is [`2024/SIH1704.md`](2024/SIH1704.md) at 2,225 words.

## 🔬 Anatomy of a problem statement

One statement, one file, named for its official ID. The schema is identical across
all 607 files: an `H1` title carrying the ID, a four-field metadata block, then
free-form sections.

```markdown
# SIH26001 — AI-Based early warning and landslide Risk Monitoring System in NER

**Organization:** Ministry of Development of North Eastern Region (MDoNER)
**Department:** Ministry of Development of North Eastern Region (MDoNER)
**Category:** Software
**Theme:** Disaster Management

## Problem Statement

Background:
The North Eastern Region (NER) frequently faces landslides, flash floods, ...

## Expected Solution

A scalable AI-based software platform with:
• Real-time GIS dashboard and risk heatmaps
...
```

**Guaranteed on all 607 files:**

| Field | Values |
| :--- | :--- |
| `**Organization:**` | 82 distinct — the ministry, state or company sponsoring it |
| `**Department:**` | The specific wing or collaborating body |
| `**Category:**` | `Software` or `Hardware` — exactly two values, no exceptions |
| `**Theme:**` | One of 18 official themes |

**Sections, by frequency:**

| Section | Files | Notes |
| :--- | ---: | :--- |
| `## Problem Statement` | 604 | The full brief — background, description, scope |
| `## Expected Solution` | 299 | Deliverable spec, when the sponsor supplied one |
| `## Dataset` | 71 | Real dataset URLs. Mostly the 2024 satellite/remote-sensing set |
| `## Expected Solutions` | 15 | Same thing, plural, as-published — see [caveats](#-data-caveats) |

Because the metadata block is a fixed four lines of predictable Markdown, the whole
corpus parses with a regex. That's the point.

## 🔍 Search recipes

No tooling required. These run on a clean clone with nothing installed.

**Find every statement for one theme, in one year:**

```bash
grep -l 'Theme:\*\* Space Technology' 2026/*.md | xargs grep -h '^# '
```

**Build a flat title index of an entire year:**

```bash
grep -h '^# ' 2026/*.md > 2026-index.txt
```

**Full-text search the corpus for a technology, across all three years:**

```bash
grep -ril 'digital twin' 2024 2025 2026
```

**Hardware-only statements, with their sponsor:**

```bash
grep -l 'Category:\*\* Hardware' 2026/*.md \
  | xargs grep -h -e '^# ' -e '^\*\*Organization'
```

**Every statement from one organisation, however they spelled it:**

```bash
grep -ril 'organization:\*\* .*isro' 2024 2025 2026   # 21 hits — two spellings
```

**Harvest every dataset URL the sponsors published:**

```bash
grep -h -A2 '^## Dataset' 2024/*.md 2025/*.md 2026/*.md | grep -o 'http[^ ]*'
```

**Rank themes by volume for a year:**

```bash
grep -h '^\*\*Theme:\*\*' 2026/*.md | sed 's/\*\*Theme:\*\* //' | sort | uniq -c | sort -rn
```

**Find problems that keep coming back** — the ones nobody has solved:

```bash
grep -h '^# ' 2024/*.md 2025/*.md 2026/*.md \
  | sed 's/^# SIH[0-9]* — //' | sort | uniq -d
```

Swap `grep` for `rg` throughout if you have ripgrep; it's roughly 10× faster on the
full-text sweeps.

## 📊 Themes across three years

18 official themes, `Miscellaneous` included. Sorted by three-year total.

| Theme | 2024 | 2025 | 2026 | Total | Trend |
| :--- | ---: | ---: | ---: | ---: | :--- |
| Smart Automation | 57 | 14 | 31 | **102** | 🔻 down from a 2024 peak |
| Miscellaneous | 35 | 18 | 38 | **91** | ▬ always the catch-all |
| Smart Education | 30 | 20 | 13 | **63** | 🔻 steady decline |
| Blockchain & Cybersecurity | 20 | 3 | 22 | **45** | 🔀 collapsed in 2025, roared back |
| MedTech / BioTech / HealthTech | 17 | 11 | 14 | **42** | ▬ stable |
| **Disaster Management** | 5 | 8 | 29 | **42** | 🔺 **5.8× in two years** |
| Agriculture, FoodTech & Rural Dev. | 11 | 17 | 12 | **40** | ▬ stable |
| Clean & Green Technology | 21 | 8 | 2 | **31** | 🔻 near-total collapse |
| Transportation & Logistics | 12 | 8 | 8 | **28** | ▬ stable |
| Robotics and Drones | 9 | 3 | 10 | **22** | 🔀 dip, then recovery |
| Space Technology | 6 | 2 | 11 | **19** | 🔺 rising |
| Renewable / Sustainable Energy | 7 | 6 | 4 | **17** | 🔻 fading |
| Travel & Tourism | 4 | 6 | 6 | **16** | ▬ stable |
| Heritage & Culture | 2 | 4 | 7 | **13** | 🔺 rising |
| Fitness & Sports | 2 | 3 | 8 | **13** | 🔺 4× |
| Smart Vehicles | 3 | 2 | 4 | **9** | ▬ small and steady |
| Toys & Games | 3 | 2 | 2 | **7** | ▬ perpetually tiny |
| Smart Resource Conservation | 2 | 0 | 5 | **7** | 🔀 skipped 2025 entirely |

**What the numbers say.** Disaster Management is the loudest signal in the archive —
5 → 8 → 29 statements, now the third-largest theme in 2026 and openly climate-framed
in the text. Space Technology nearly doubled. Meanwhile *Clean & Green Technology*
fell from 21 statements to 2, and *Smart Automation* halved from its 2024 high, which
looks less like a retreat from the subject and more like automation getting absorbed
into every other theme's problem text.

## ⚖️ The software/hardware split

`Category` has exactly two values across all 607 files. The ratio barely moves:

| Year | Software | Hardware | Software share |
| :--- | ---: | ---: | ---: |
| 2024 | 178 | 68 | `72%` ████████████████░░░░░░░ |
| 2025 | 90 | 45 | `67%` ███████████████░░░░░░░░ |
| 2026 | 172 | 54 | `76%` █████████████████░░░░░░ |
| **All** | **440** | **167** | **`72%`** |

Roughly seven in ten SIH problems are software problems, every single year. If you're
a hardware team, your competition is thinner — 167 statements across three editions.

## 🏛️ Who's asking

82 distinct sponsoring organisations. Top of the list:

| Organisation | Statements |
| :--- | ---: |
| AICTE *(incl. `AICTE, MIC-Student Innovation`)* | 106 |
| Ministry of Earth Sciences (MoES) | 38 |
| National Technical Research Organisation (NTRO) | 37 |
| Ministry of Jal Shakti | 26 |
| Indian Space Research Organisation (ISRO) *(both spellings)* | 21 |
| Government of NCT of Delhi | 16 |
| Government of Punjab | 15 |
| Government of Kerala | 14 |
| Ministry of Communication | 12 |
| Autodesk | 12 |

The AICTE bucket — **106 statements**, ~17% of the corpus — is the *Student Innovation*
category: an open brief where teams propose their own problem rather than solving a
sponsor's. It runs at a near-constant 35–37 statements every year. Beyond AICTE the
list is dominated by earth-observation and remote-sensing bodies (MoES, NTRO, ISRO,
Jal Shakti account for another 122), which is also why the 71 `## Dataset` sections
are mostly satellite catalogues.

## 🕳️ Coverage & gaps

This archive is honest about what it doesn't have. **20 known IDs are absent.**

**2024** — 246 of 259 IDs in range. Missing:

```
1551 1552 1553 1634 1635 1636 1662 1663 1665 1713 1763 1766 1769
```

**2025** — 135 of 142 IDs in range, and explicitly partial per
[ATTRIBUTION.md](ATTRIBUTION.md). Missing:

```
25078 25086 25087 25088 25089 25105 25106
```

**2026** — 226 of 226. Complete, contiguous, no gaps. ✅

Some gaps are genuinely absent upstream — SIH withdraws statements after publishing.
Others are collection misses. If you have a published statement whose ID appears
above, [that's the highest-value PR you can send](CONTRIBUTING.md).

## ⚠️ Data caveats

Text is reproduced **as published**, which means the sponsors' own inconsistencies are
preserved rather than silently corrected. Read this before you build on the corpus:

- **Three files have no `## Problem Statement` section.** `2026/SIH26031.md`,
  `SIH26032.md` and `SIH26033.md` carry the entire brief in the `H1` title and jump
  straight to `## Expected Solution`. That's how they were published. Any parser
  that assumes the section exists will throw on exactly these three.
- **`## Expected Solutions` (plural) appears in 15 files.** Match both spellings.
- **Themes are occasionally mislabelled at the source.** `2026/SIH26031.md` is an
  onion-grading computer-vision problem filed under *Fitness & Sports*. Not a
  transcription error — reproduced faithfully. Don't trust `Theme` as ground truth
  for classification work; the title and body are reliable, the label sometimes isn't.
- **Organisation names are not normalised keys.** ISRO appears as both
  `Indian Space Research Organisation(ISRO)` (no space, 11×) and
  `Indian Space Research Organization (ISRO)` (`z`, spaced, 10×). Always match
  case-insensitively and fuzzily; never `GROUP BY` the raw string.
- **`Organization` and `Department` are often identical** — many ministries fill both
  fields with their own name.
- **Bullets are `•`, not `-`.** Sponsors pasted from Word. Character encoding was
  repaired, but list markers were left as authored.
- **ID schemes differ by year.** 2024 uses bare 4-digit IDs (`SIH1524`); 2025 and 2026
  prefix the year (`SIH25001`, `SIH26001`). Sort numerically per year, not globally.
- **No wording was changed.** Only Markdown structure, whitespace, stray markup and
  mojibake were normalised. Nothing was summarised or rewritten.

## 🤝 Contributing

The most useful contributions, in order:

1. **Fill a gap** from [Coverage & Gaps](#-coverage--gaps) — a missing 2024 or 2025 statement.
2. **Complete 2025**, which is partial by design and the weakest year in the archive.
3. **Fix a transcription error** — mojibake, a truncated section, a dropped bullet.
4. **Add a future edition** when SIH 2027 publishes.

One statement per file, one file per PR-able unit, `YEAR/SIHxxxx.md` and nothing else
— see [`.gitignore`](.gitignore), which deliberately blocks scripts, JSON, PDFs and
scratch data from ever landing here.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the exact file format and validation
commands, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening a PR.

## 📄 Attribution & reuse

**The problem statement text is not this repository's work.** It belongs to its
original authors — the Government of India ministries, departments, state governments
and organisations that published it, and Smart India Hackathon / AICTE. No authorship
or ownership of that text is claimed here, and no logos, images or branding are
included.

There is **no `LICENSE` file** in this repository, and that is deliberate: the archive
cannot license text it does not own. What it can do is document provenance precisely.
**Read [ATTRIBUTION.md](ATTRIBUTION.md) before reusing this data** — it names every
source, notes that the 2026 data derives from
[vedantchalke36/sih-2026-problem-statements](https://github.com/vedantchalke36/sih-2026-problem-statements)
under **CC BY 4.0** (© Vedant Chalke), and records exactly what normalisation was
applied. If you redistribute, carry that attribution forward.

Corrections to the provenance record are as welcome as corrections to the data.

## 👥 Maintainer

**[@DeadIndian](https://github.com/DeadIndian)** — corrections and additions welcome via
[issues](https://github.com/DeadIndian/sih-ps-archive/issues) or
[pull requests](https://github.com/DeadIndian/sih-ps-archive/pulls).

---

<div align="center">

**607 problem statements. 82 organisations. 3 editions. 0 dependencies.**

<sub>Not affiliated with Smart India Hackathon, AICTE, or the Government of India.<br>
An independent archive of publicly published material.</sub>

</div>
