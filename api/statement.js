// Public, crawlable statement pages. Googlebot has no session, so the SPA's
// authenticated fetch left every statement invisible and every deep link
// canonicalised to "/". This renders the official statement into the app shell
// server-side with its own canonical, so each PS is an indexable page. The app
// still hydrates on top for signed-in users.
import fs from "node:fs";
import { db } from "../lib/db.js";
import { methodNotAllowed } from "../lib/http.js";

const ORIGIN = (process.env.APP_ORIGIN || "").split(",")[0].trim() || "https://sih.saireddy.dev";
const SITE = "SIH 2026 Selection Desk";

// Read once per function instance: the shell never changes between requests.
let shell;
let statements;

function loadShell() {
  shell ||= fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  return shell;
}

async function loadStatements() {
  statements ||= new Map((await db()`SELECT ps_number, data FROM problem_statements ORDER BY sno ASC`)
    .map((row) => [row.ps_number, row.data]));
  return statements;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

// A meta description is truncated by search engines well before 200 characters, so
// cut on a word boundary rather than mid-word.
function clamp(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(" ", max) || max)}…`;
}

function fact(label, value) {
  return value ? `<div class="mini-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>` : "";
}

function statementBody(problem) {
  return `<p class="detail-eyebrow">${escapeHtml(problem.org)}</p>
    <h1 id="detail-title">${escapeHtml(problem.title)}</h1>
    <div class="detail-tags"><span class="detail-tag">${escapeHtml(problem.ps_number)}</span><span class="detail-tag">${escapeHtml(problem.category)}</span><span class="detail-tag">${escapeHtml(problem.theme)}</span></div>
    <div class="detail-grid"><div>
      <section class="detail-section"><h2>Official description</h2><p class="detail-prose">${escapeHtml(problem.description)}</p></section>
    </div><aside>
      ${fact("Organization", problem.org)}${fact("Department", problem.department)}
      ${fact("Category", problem.category)}${fact("Theme", problem.theme)}
      ${fact("Deadline for idea submission", problem.deadline)}
      <p class="detail-eyebrow">Official source: <a href="https://sih.gov.in/sih2026PS" rel="noreferrer noopener">sih.gov.in</a></p>
    </aside></div>`;
}

function indexBody(rows) {
  const items = rows.map((problem) => `<li><a href="${ORIGIN}/problem-statements/${encodeURIComponent(problem.ps_number)}">${escapeHtml(problem.ps_number)} — ${escapeHtml(problem.title)}</a></li>`).join("");
  return `<h1 id="detail-title">All ${rows.length} SIH 2026 problem statements</h1>
    <section class="detail-section"><h2>Every official Smart India Hackathon 2026 problem statement</h2>
    <ul>${items}</ul></section>`;
}

// Swap the shell's homepage metadata for this page's own. Each replacement is
// anchored on the exact tag in index.html, so a change there fails loudly in the
// guard check rather than silently serving homepage metadata on every statement.
function render({ title, description, url, body, ld }) {
  const meta = [
    [/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`],
    [/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(description)}" />`],
    [/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escapeHtml(url)}" />`],
    [/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`],
    [/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`],
    [/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escapeHtml(url)}" />`],
    [/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`],
    [/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`],
    [/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`],
    // The crawler must reach the statement without JavaScript, so the detail view
    // ships visible and the loading screen ships hidden.
    [/<section class="access-gate access-gate-loading" id="boot-screen"/, '<section class="access-gate access-gate-loading" id="boot-screen" hidden'],
    [/<article class="detail-view" id="detail-view" hidden/, '<article class="detail-view" id="detail-view"'],
    [/<body>/, '<body data-server-rendered="statement">'],
    // The statement's own title is the page h1, so the hidden list heading steps down.
    [/<h1 id="page-title">/, '<h2 id="page-title">'],
    [/<\/h1>\s*<\/div>/, '</h2>\n        </div>'],
  ];
  let html = loadShell();
  for (const [pattern, replacement] of meta) html = html.replace(pattern, replacement);
  return html.replace(/(<div class="detail-body" id="detail-body">)[\s\S]*?(<\/div>)/, `$1${body}$2`);
}

function send(response, status, html) {
  response.status(status);
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  // Public, rarely-changing pages: served from the CDN, revalidated hourly, so the
  // database is read once per instance rather than once per crawl.
  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  return response.send(html);
}

function breadcrumb(url, name) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "SIH 2026 problem statements", item: `${ORIGIN}/problem-statements` },
      { "@type": "ListItem", position: 2, name, item: url },
    ],
  };
}

export default async function handler(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const id = String(request.query.id || "").trim().toUpperCase().replace(/\/$/, "");
  const rows = await loadStatements();

  if (!id) {
    const url = `${ORIGIN}/problem-statements`;
    const list = [...rows.values()];
    return send(response, 200, render({
      title: `All ${list.length} SIH 2026 Problem Statements — Full Official List`,
      description: `Every official Smart India Hackathon 2026 problem statement (${list.length} total) with its organisation, theme and category. Open any statement for the full official description.`,
      url,
      body: indexBody(list),
      ld: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `All ${list.length} SIH 2026 problem statements`,
        url,
        inLanguage: "en-IN",
        isPartOf: { "@type": "WebSite", name: SITE, url: `${ORIGIN}/` },
      },
    }));
  }

  const problem = rows.get(id);
  if (!problem) {
    return send(response, 404, render({
      title: "Problem statement not found — SIH 2026",
      description: "That Smart India Hackathon 2026 problem statement number does not exist.",
      url: `${ORIGIN}/problem-statements`,
      body: '<h1 id="detail-title">Statement not found</h1><p class="detail-prose">That problem statement number does not exist. <a href="/problem-statements">Browse all statements</a>.</p>',
      ld: { "@context": "https://schema.org", "@type": "WebPage", name: "Problem statement not found" },
    }));
  }

  const url = `${ORIGIN}/problem-statements/${encodeURIComponent(problem.ps_number)}`;
  const title = `${problem.ps_number} — ${clamp(problem.title, 90)} | SIH 2026`;
  return send(response, 200, render({
    title,
    description: clamp(`${problem.ps_number}: ${problem.description}`, 180),
    url,
    body: statementBody(problem),
    ld: {
      "@context": "https://schema.org",
      "@graph": [
        breadcrumb(url, problem.ps_number),
        {
          "@type": "WebPage",
          name: problem.title,
          url,
          description: clamp(problem.description, 300),
          inLanguage: "en-IN",
          isPartOf: { "@type": "WebSite", name: SITE, url: `${ORIGIN}/` },
          about: {
            "@type": "CreativeWork",
            name: problem.title,
            identifier: problem.ps_number,
            genre: problem.theme,
            creator: { "@type": "Organization", name: problem.org },
          },
        },
      ],
    },
  }));
}
