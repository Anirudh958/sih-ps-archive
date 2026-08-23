const state = {
  problems: [],
  search: "",
  theme: "",
  org: "",
  category: "",
  effort: "",
  innovation: "",
  quick: "",
  sort: "recommended",
  starred: new Set(JSON.parse(localStorage.getItem("sih-starred") || "[]")),
};

const $ = (selector) => document.querySelector(selector);
const list = $("#problem-list");
const filters = $("#filters");
const dialog = $("#detail-dialog");
const filterNames = { search: "Search", theme: "Theme", org: "Organization", category: "Category", effort: "Effort", innovation: "Innovation", quick: "Quick pick" };

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function unique(field) {
  return [...new Set(state.problems.map((problem) => problem[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function populateSelect(selector, values) {
  const select = $(selector);
  values.forEach((value) => select.add(new Option(value, value)));
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  ["search", "theme", "org", "category", "effort", "innovation", "quick", "sort"].forEach((key) => {
    if (params.has(key)) state[key] = params.get(key);
  });
}

function syncUrl() {
  const params = new URLSearchParams();
  ["search", "theme", "org", "category", "effort", "innovation", "quick", "sort"].forEach((key) => {
    if (state[key] && !(key === "sort" && state[key] === "recommended")) params.set(key, state[key]);
  });
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

function syncControls() {
  $("#search").value = state.search;
  ["theme", "org", "effort", "innovation", "sort"].forEach((key) => $(`#${key}`).value = state[key]);
  document.querySelectorAll("#category-filter button").forEach((button) => button.classList.toggle("active", button.dataset.value === state.category));
  document.querySelectorAll("[data-quick]").forEach((button) => button.classList.toggle("active", button.dataset.quick === state.quick));
}

function searchableText(problem) {
  return [problem.ps_number, problem.title, problem.org, problem.category, problem.theme, problem.background, problem.description, problem.problem_decode?.plain_summary, ...(problem.expected_solution_bullets || [])].join(" ").toLowerCase();
}

function filteredProblems() {
  const query = state.search.trim().toLowerCase();
  const effortRank = { Low: 1, Medium: 2, High: 3 };
  const innovationRank = { Breakthrough: 3, Moderate: 2, Incremental: 1 };
  const competitionRank = { Low: 1, Medium: 2, High: 3, "Very High": 4 };
  const verdictRank = { GREEN: 3, YELLOW: 2, RED: 1 };

  const filtered = state.problems.filter((problem) => {
    if (query && !searchableText(problem).includes(query)) return false;
    if (state.theme && problem.theme !== state.theme) return false;
    if (state.org && problem.org !== state.org) return false;
    if (state.category && problem.category !== state.category) return false;
    if (state.effort && problem.invention_effort?.tier !== state.effort) return false;
    if (state.innovation && problem.innovation_scope?.tier !== state.innovation) return false;
    if (state.quick === "recommended" && problem.verdict?.tier !== "GREEN") return false;
    if (state.quick === "low-effort" && problem.invention_effort?.tier !== "Low") return false;
    if (state.quick === "dataset" && !problem.dataset_link) return false;
    if (state.quick === "starred" && !state.starred.has(problem.ps_number)) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (state.sort === "number") return a.ps_number.localeCompare(b.ps_number, undefined, { numeric: true });
    if (state.sort === "innovation") return innovationRank[b.innovation_scope?.tier] - innovationRank[a.innovation_scope?.tier] || a.sno - b.sno;
    if (state.sort === "effort") return effortRank[a.invention_effort?.tier] - effortRank[b.invention_effort?.tier] || a.sno - b.sno;
    if (state.sort === "competition") return (competitionRank[a.competitive_landscape?.tier] || 9) - (competitionRank[b.competitive_landscape?.tier] || 9) || a.sno - b.sno;
    return verdictRank[b.verdict?.tier] - verdictRank[a.verdict?.tier] || (b.verdict?.score || 0) - (a.verdict?.score || 0) || a.sno - b.sno;
  });
}

function cardTemplate(problem) {
  const starred = state.starred.has(problem.ps_number);
  const summary = problem.problem_decode?.plain_summary || problem.description || problem.background;
  return `<article class="problem-card" data-id="${escapeHtml(problem.ps_number)}">
    <div><span class="ps-id">${escapeHtml(problem.ps_number)}</span><span class="ps-category">${escapeHtml(problem.category)}</span></div>
    <div class="card-main">
      <h2><button type="button" data-open="${escapeHtml(problem.ps_number)}">${escapeHtml(problem.title)}</button></h2>
      <p class="card-org">${escapeHtml(problem.org)} · ${escapeHtml(problem.theme)}</p>
      <p class="card-summary">${escapeHtml(summary)}</p>
    </div>
    <div class="card-facts">
      <div class="fact"><span>Verdict</span><strong class="verdict ${problem.verdict?.tier?.toLowerCase() || "yellow"}">${escapeHtml(problem.verdict?.tier || "—")}</strong></div>
      <div class="fact"><span>Effort</span><strong>${escapeHtml(problem.invention_effort?.tier || "—")}</strong></div>
      <div class="fact"><span>Innovation</span><strong>${escapeHtml(problem.innovation_scope?.tier || "—")}</strong></div>
      ${problem.dataset_link ? '<div class="fact"><span>Data</span><strong class="dataset-dot">Available</strong></div>' : ""}
    </div>
    <button class="icon-button ${starred ? "starred" : ""}" type="button" data-star="${escapeHtml(problem.ps_number)}" aria-label="${starred ? "Remove star from" : "Star"} ${escapeHtml(problem.ps_number)}" title="${starred ? "Remove from shortlist" : "Add to shortlist"}">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>
    </button>
  </article>`;
}

function activeFilterEntries() {
  return ["search", "theme", "org", "category", "effort", "innovation", "quick"]
    .filter((key) => state[key])
    .map((key) => [key, state[key] === "low-effort" ? "Low effort" : state[key] === "dataset" ? "Has dataset" : state[key][0].toUpperCase() + state[key].slice(1)]);
}

function render() {
  const problems = filteredProblems();
  list.innerHTML = problems.map(cardTemplate).join("");
  list.hidden = problems.length === 0;
  $("#empty-state").hidden = problems.length !== 0;
  $("#result-count").textContent = problems.length;
  $("#active-summary").textContent = problems.length === state.problems.length ? "across the full dataset" : `of ${state.problems.length}`;

  const entries = activeFilterEntries();
  $("#active-filters").innerHTML = entries.map(([key, label]) => `<button class="active-filter" type="button" data-remove-filter="${key}" title="Remove ${filterNames[key]}">${escapeHtml(label)}</button>`).join("");
  $("#filter-badge").textContent = entries.length;
  syncControls();
  syncUrl();
}

function listSection(title, items) {
  if (!items?.length) return "";
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
}

function detailTemplate(problem) {
  const plan = Object.values(problem.build_plan_36h || {}).map((stage) => `<div class="plan-stage"><h4>${escapeHtml(stage.label)}</h4><ul>${(stage.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`).join("");
  return `<p class="detail-eyebrow">${escapeHtml(problem.org)}</p>
    <h2 id="detail-title">${escapeHtml(problem.title)}</h2>
    <div class="detail-tags">
      <span class="detail-tag">${escapeHtml(problem.category)}</span><span class="detail-tag">${escapeHtml(problem.theme)}</span>
      <span class="detail-tag">${escapeHtml(problem.innovation_scope?.tier)} innovation</span><span class="detail-tag">${escapeHtml(problem.invention_effort?.tier)} effort</span>
    </div>
    <div class="detail-grid">
      <div>
        <section class="detail-section"><h3>Problem decoded</h3><p>${escapeHtml(problem.problem_decode?.plain_summary || problem.description)}</p></section>
        <section class="detail-section"><h3>Background</h3><p>${escapeHtml(problem.background)}</p></section>
        <section class="detail-section"><h3>Official description</h3><p>${escapeHtml(problem.description).replaceAll("\n", "<br>")}</p></section>
        ${listSection("Expected solution", problem.expected_solution_bullets)}
        ${listSection("Pain points", problem.problem_decode?.pain_points)}
        <section class="detail-section"><h3>Competitive landscape</h3><p><strong>${escapeHtml(problem.competitive_landscape?.tier || "—")} competition.</strong> ${escapeHtml(problem.competitive_landscape?.reason)}</p><p>${escapeHtml(problem.competitive_landscape?.differentiation_angle)}</p></section>
        <section class="detail-section"><h3>36-hour build plan</h3>${plan}</section>
        ${listSection("Questions evaluators may ask", problem.evaluator_questions)}
      </div>
      <aside>
        <div class="verdict-panel">
          <span class="verdict ${problem.verdict?.tier?.toLowerCase() || "yellow"}">${escapeHtml(problem.verdict?.tier || "—")}</span>
          <strong>${escapeHtml(problem.verdict?.why)}</strong>
          <p>${escapeHtml(problem.verdict?.validate)}</p>
        </div>
        <div class="mini-stat"><span>Invention effort</span><strong>${escapeHtml(problem.invention_effort?.tier || "—")} · score ${escapeHtml(problem.invention_effort?.score ?? "—")}</strong></div>
        <div class="mini-stat"><span>Innovation scope</span><strong>${escapeHtml(problem.innovation_scope?.tier || "—")}</strong></div>
        <div class="mini-stat"><span>Competition</span><strong>${escapeHtml(problem.competitive_landscape?.tier || "—")}</strong></div>
        <div class="mini-stat"><span>Ideas submitted</span><strong>${escapeHtml(problem.ideas || "—")}</strong></div>
        <div class="mini-stat"><span>Deadline</span><strong>${escapeHtml(problem.deadline || "—")}</strong></div>
        ${problem.dataset_link ? `<a class="detail-link" href="${escapeHtml(problem.dataset_link)}" target="_blank" rel="noreferrer">Open official dataset ↗</a>` : ""}
        ${listSection("Strengths", problem.swot?.strengths)}
        ${listSection("Risks", [...(problem.swot?.weaknesses || []), ...(problem.swot?.threats || [])])}
        ${listSection("Opportunities", problem.swot?.opportunities)}
      </aside>
    </div>`;
}

function openDetail(id) {
  const problem = state.problems.find((item) => item.ps_number === id);
  if (!problem) return;
  $("#detail-number").textContent = problem.ps_number;
  $("#dialog-content").innerHTML = detailTemplate(problem);
  $("#detail-star").dataset.star = id;
  $("#detail-star").classList.toggle("starred", state.starred.has(id));
  dialog.showModal();
}

function toggleStar(id) {
  state.starred.has(id) ? state.starred.delete(id) : state.starred.add(id);
  localStorage.setItem("sih-starred", JSON.stringify([...state.starred]));
  render();
  if (dialog.open && $("#detail-star").dataset.star === id) $("#detail-star").classList.toggle("starred", state.starred.has(id));
}

function clearFilters() {
  Object.assign(state, { search: "", theme: "", org: "", category: "", effort: "", innovation: "", quick: "" });
  render();
}

function bindEvents() {
  $("#search").addEventListener("input", (event) => { state.search = event.target.value; render(); });
  ["theme", "org", "effort", "innovation", "sort"].forEach((key) => $(`#${key}`).addEventListener("change", (event) => { state[key] = event.target.value; render(); }));
  $("#category-filter").addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) { state.category = button.dataset.value; render(); } });
  document.querySelector(".quick-picks").addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) { state.quick = state.quick === button.dataset.quick ? "" : button.dataset.quick; render(); } });
  list.addEventListener("click", (event) => { const star = event.target.closest("[data-star]"); const open = event.target.closest("[data-open]"); if (star) toggleStar(star.dataset.star); if (open) openDetail(open.dataset.open); });
  $("#active-filters").addEventListener("click", (event) => { const button = event.target.closest("[data-remove-filter]"); if (button) { state[button.dataset.removeFilter] = ""; render(); } });
  $("#clear-filters").addEventListener("click", clearFilters);
  $("#empty-clear").addEventListener("click", clearFilters);
  $("#dialog-close").addEventListener("click", () => dialog.close());
  $("#detail-star").addEventListener("click", (event) => toggleStar(event.currentTarget.dataset.star));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  $("#mobile-filter-button").addEventListener("click", () => { filters.classList.add("open"); $("#filter-backdrop").hidden = false; });
  $("#filter-close").addEventListener("click", closeMobileFilters);
  $("#filter-backdrop").addEventListener("click", closeMobileFilters);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && filters.classList.contains("open")) closeMobileFilters();
    if (event.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { event.preventDefault(); $("#search").focus(); }
  });
}

function closeMobileFilters() {
  filters.classList.remove("open");
  $("#filter-backdrop").hidden = true;
}

async function init() {
  try {
    const response = await fetch("ps.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.problems = await response.json();
    readUrl();
    populateSelect("#theme", unique("theme"));
    populateSelect("#org", unique("org"));
    $("#total-count").textContent = state.problems.length;
    $("#theme-count").textContent = unique("theme").length;
    $("#org-count").textContent = unique("org").length;
    bindEvents();
    render();
  } catch (error) {
    list.innerHTML = `<div class="empty-state"><h2>Could not load ps.json</h2><p>Run this directory through a local web server, then reload the page.</p></div>`;
    console.error(error);
  }
}

init();
