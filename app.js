const state = {
  problems: [],
  total: 0,
  page: 1,
  hasMore: false,
  accessToken: "",
  email: "",
  search: "",
  theme: "",
  org: "",
  category: "",
  effort: "",
  innovation: "",
  verdict: "",
  from: "",
  to: "",
  quick: "",
  sort: "recommended",
  team: null,
  view: "list",
  cameFromList: false,
  listLoaded: false,
  filtersLoaded: false,
  starred: new Set(JSON.parse(localStorage.getItem("sih-starred") || "[]")),
};

const $ = (selector) => document.querySelector(selector);
const list = $("#problem-list");
const filters = $("#filters");
const filterNames = { search: "Search", theme: "Theme", org: "Organization", category: "Category", effort: "Effort", innovation: "Innovation", verdict: "Verdict", from: "From PS", to: "To PS", quick: "Quick pick" };
const DETAIL_PREFIX = "/problem-statements/";
let refreshRequest;
let searchTimer;
let listRequest;
let metadataRequest;
let toastTimer;
let pendingRoute = "";

function detailCacheKey(id) {
  return state.email ? `sih-detail:${state.email}:${id}` : "";
}

function readCachedDetail(id) {
  const key = detailCacheKey(id);
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedDetail(id, problem) {
  const key = detailCacheKey(id);
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(problem));
  } catch {}
}

function readCachedMetadata() {
  try {
    const raw = sessionStorage.getItem("sih-filters:v1");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedMetadata(metadata) {
  try {
    sessionStorage.setItem("sih-filters:v1", JSON.stringify(metadata));
  } catch {}
}

function applyMetadata(metadata) {
  populateSelect("#theme", metadata.themes);
  populateSelect("#org", metadata.orgs);
  $("#total-count").textContent = metadata.stats.total;
  $("#theme-count").textContent = metadata.stats.themes;
  $("#org-count").textContent = metadata.stats.orgs;
  state.filtersLoaded = true;
  syncControls();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

// Only these are ever used as a CSS class, so anything else becomes the neutral one
// rather than being interpolated into the attribute verbatim.
function verdictClass(value) {
  const tier = String(value || "").toLowerCase();
  return ["green", "yellow", "red"].includes(tier) ? tier : "yellow";
}

// escapeHtml makes a URL safe to sit inside an attribute but does nothing about its
// scheme: `javascript:...` would survive it intact.
function safeUrl(value) {
  try {
    const url = new URL(String(value), location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function toast(message, kind = "ok") {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast ${kind}`;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 4000);
}

function busy(form, isBusy, label) {
  const button = form.querySelector("button[type=submit]");
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = isBusy;
  button.textContent = isBusy ? label : button.dataset.label;
}

function populateSelect(selector, values) {
  const select = $(selector);
  select.length = 1;
  values.forEach((value) => select.add(new Option(value, value)));
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  ["search", "theme", "org", "category", "effort", "innovation", "verdict", "from", "to", "quick", "sort"].forEach((key) => {
    if (params.has(key)) state[key] = params.get(key);
  });
}

function syncUrl() {
  if (state.view !== "list") return;
  const params = new URLSearchParams();
  ["search", "theme", "org", "category", "effort", "innovation", "verdict", "from", "to", "quick", "sort"].forEach((key) => {
    if (state[key] && !(key === "sort" && state[key] === "recommended")) params.set(key, state[key]);
  });
  history.replaceState(history.state, "", `/${params.size ? `?${params}` : ""}`);
}

function syncControls() {
  $("#search").value = state.search;
  ["theme", "org", "effort", "innovation", "verdict", "sort"].forEach((key) => $(`#${key}`).value = state[key]);
  $("#ps-from").value = state.from;
  $("#ps-to").value = state.to;
  document.querySelectorAll("#category-filter button").forEach((button) => button.classList.toggle("active", button.dataset.value === state.category));
  document.querySelectorAll("[data-quick]").forEach((button) => button.classList.toggle("active", button.dataset.quick === state.quick));
}

async function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = fetch("/api/session/refresh", { method: "POST", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) {
          const failure = new Error(response.status === 401 ? "Session expired" : `Could not restore your session (${response.status})`);
          failure.status = response.status;
          throw failure;
        }
        const result = await response.json();
        state.accessToken = result.accessToken;
        state.email = result.email || "";
        state.team = result.team || null;
        return result.accessToken;
      })
      .finally(() => { refreshRequest = null; });
  }
  return refreshRequest;
}

async function api(path, options = {}, retry = true) {
  const headers = new Headers(options.headers);
  if (state.accessToken) headers.set("Authorization", `Bearer ${state.accessToken}`);
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  if (response.status === 401 && retry) {
    try {
      await refreshAccessToken();
    } catch (error) {
      // Same rule as boot: only a 401 from the refresh means the session is really gone.
      if (error.status === 401) showGate("Your session expired. Log in again.");
      throw error;
    }
    return api(path, options, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json();
}

function queryString(page) {
  const params = new URLSearchParams({ page, sort: state.sort });
  ["search", "theme", "org", "category", "effort", "innovation", "verdict", "from", "to", "quick"].forEach((key) => {
    if (state[key]) params.set(key, state[key]);
  });
  if (state.quick === "starred") params.set("ids", [...state.starred].join(","));
  return params;
}

async function loadProblems({ append = false } = {}) {
  listRequest?.abort();
  listRequest = new AbortController();
  const page = append ? state.page + 1 : 1;
  $("#load-more").disabled = true;
  try {
    const result = await api(`/api/problems?${queryString(page)}`, { signal: listRequest.signal });
    state.problems = append ? [...state.problems, ...result.items] : result.items;
    state.page = result.page;
    state.total = result.total;
    state.hasMore = result.hasMore;
    state.listLoaded = true;
    render();
  } catch (error) {
    if (error.name !== "AbortError") showListError(error.message);
  } finally {
    $("#load-more").disabled = false;
  }
}

async function loadMetadata() {
  if (state.filtersLoaded) return;
  const cached = readCachedMetadata();
  if (cached) {
    applyMetadata(cached);
    return;
  }
  if (!metadataRequest) {
    metadataRequest = api("/api/filters")
      .then((metadata) => {
        writeCachedMetadata(metadata);
        applyMetadata(metadata);
      })
      .finally(() => { metadataRequest = null; });
  }
  return metadataRequest;
}

async function loadMetadataNonFatal() {
  try {
    await loadMetadata();
  } catch (error) {
    toast(`Filters are unavailable right now: ${error.message}`, "error");
  }
}

function cardTemplate(problem) {
  const starred = state.starred.has(problem.ps_number);
  const id = escapeHtml(problem.ps_number);
  return `<article class="problem-card" data-open="${id}" tabindex="0" role="link" aria-label="Open ${id} in full">
    <div><span class="ps-id">${id}</span><span class="ps-category">${escapeHtml(problem.category)}</span></div>
    <div class="card-main">
      <h2>${escapeHtml(problem.title)}</h2>
      <p class="card-org">${escapeHtml(problem.org)} · ${escapeHtml(problem.theme)}</p>
      <p class="card-summary">${escapeHtml(problem.summary)}</p>
      <span class="card-more">Read full statement →</span>
    </div>
    <div class="card-facts">
      <div class="fact"><span>Verdict</span><strong class="verdict ${verdictClass(problem.verdict)}">${escapeHtml(problem.verdict || "—")}</strong></div>
      <div class="fact"><span>Effort</span><strong>${escapeHtml(problem.effort || "—")}</strong></div>
      <div class="fact"><span>Innovation</span><strong>${escapeHtml(problem.innovation || "—")}</strong></div>
      ${problem.has_dataset ? '<div class="fact"><span>Data</span><strong class="dataset-dot">Available</strong></div>' : ""}
    </div>
    <button class="icon-button ${starred ? "starred" : ""}" type="button" data-star="${id}" aria-label="${starred ? "Remove star from" : "Star"} ${id}" title="${starred ? "Remove from shortlist" : "Add to shortlist"}">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>
    </button>
  </article>`;
}

function activeFilterEntries() {
  return ["search", "theme", "org", "category", "effort", "innovation", "verdict", "from", "to", "quick"]
    .filter((key) => state[key])
    .map((key) => [key, key === "from" ? `From ${state[key]}` : key === "to" ? `To ${state[key]}` : state[key] === "low-effort" ? "Low effort" : state[key] === "dataset" ? "Has dataset" : state[key][0].toUpperCase() + state[key].slice(1)]);
}

function render() {
  list.innerHTML = state.problems.map(cardTemplate).join("");
  list.hidden = state.total === 0;
  $("#empty-state").hidden = state.total !== 0;
  $("#result-count").textContent = state.total;
  $("#active-summary").textContent = `· showing ${state.problems.length}`;
  $("#load-more").hidden = !state.hasMore;
  const entries = activeFilterEntries();
  $("#active-filters").innerHTML = entries.map(([key, label]) => `<button class="active-filter" type="button" data-remove-filter="${key}" title="Remove ${filterNames[key]}">${escapeHtml(label)}</button>`).join("");
  $("#filter-badge").textContent = entries.length;
  syncControls();
  syncUrl();
}

function showListError(message) {
  list.hidden = false;
  list.innerHTML = `<div class="empty-state"><h2>Could not load statements</h2><p>${escapeHtml(message)}</p></div>`;
}

function listSection(title, items) {
  if (!items?.length) return "";
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
}

// pre-wrap keeps the source paragraphs, line breaks and lettered lists intact
// without turning the text into markup.
function proseSection(title, body) {
  return body ? `<section class="detail-section"><h3>${escapeHtml(title)}</h3><p class="detail-prose">${escapeHtml(body)}</p></section>` : "";
}

function scorecardSection(scorecard) {
  const rows = Object.values(scorecard || {}).filter((row) => row?.label);
  if (!rows.length) return "";
  return `<section class="detail-section"><h3>Evaluation scorecard</h3><dl class="scorecard">${rows.map((row) => `
    <div><dt>${escapeHtml(row.label)}</dt><dd><strong>${escapeHtml(row.tier || "—")}</strong>${row.note ? `<span>${escapeHtml(row.note)}</span>` : ""}</dd></div>`).join("")}</dl></section>`;
}

function detailTemplate(problem) {
  const plan = Object.values(problem.build_plan_36h || {}).map((stage) => `<div class="plan-stage"><h4>${escapeHtml(stage.label)}</h4><ul>${(stage.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`).join("");
  return `<p class="detail-eyebrow">${escapeHtml(problem.org)}</p>
    <h2 id="detail-title">${escapeHtml(problem.title)}</h2>
    <div class="detail-tags"><span class="detail-tag">${escapeHtml(problem.ps_number)}</span><span class="detail-tag">${escapeHtml(problem.category)}</span><span class="detail-tag">${escapeHtml(problem.theme)}</span><span class="detail-tag">${escapeHtml(problem.innovation_scope?.tier)} innovation</span><span class="detail-tag">${escapeHtml(problem.invention_effort?.tier)} effort</span></div>
    <div class="detail-grid"><div>
      ${proseSection("Problem decoded", problem.problem_decode?.plain_summary || problem.description)}
      ${proseSection("Why it matters", problem.problem_decode?.why_it_matters)}
      ${proseSection("Background", problem.background)}
      ${proseSection("Official description", problem.description)}
      ${listSection("Expected solution", problem.expected_solution_bullets)}${listSection("Pain points", problem.problem_decode?.pain_points)}
      <section class="detail-section"><h3>Competitive landscape</h3><p><strong>${escapeHtml(problem.competitive_landscape?.tier || "—")} competition.</strong> ${escapeHtml(problem.competitive_landscape?.reason)}</p><p>${escapeHtml(problem.competitive_landscape?.differentiation_angle)}</p></section>
      <section class="detail-section"><h3>36-hour build plan</h3>${plan}</section>${listSection("Questions evaluators may ask", problem.evaluator_questions)}
      ${scorecardSection(problem.evaluation_scorecard)}
    </div><aside>
      <div class="verdict-panel"><span class="verdict ${verdictClass(problem.verdict?.tier)}">${escapeHtml(problem.verdict?.tier || "—")}</span><strong>${escapeHtml(problem.verdict?.why)}</strong><p>${escapeHtml(problem.verdict?.validate)}</p></div>
      <div class="mini-stat"><span>Invention effort</span><strong>${escapeHtml(problem.invention_effort?.tier || "—")} · score ${escapeHtml(problem.invention_effort?.score ?? "—")}</strong></div>
      <div class="mini-stat"><span>Innovation scope</span><strong>${escapeHtml(problem.innovation_scope?.tier || "—")}</strong><span class="mini-note">${escapeHtml(problem.innovation_scope?.reason || "")}</span></div>
      <div class="mini-stat"><span>Competition</span><strong>${escapeHtml(problem.competitive_landscape?.tier || "—")}</strong></div>
      <div class="mini-stat"><span>Ideas submitted</span><strong>${escapeHtml(problem.ideas || "—")}</strong></div>
      <div class="mini-stat"><span>Deadline</span><strong>${escapeHtml(problem.deadline || "—")}</strong></div>
      ${safeUrl(problem.dataset_link) ? `<a class="detail-link" href="${escapeHtml(safeUrl(problem.dataset_link))}" target="_blank" rel="noreferrer noopener">Open official dataset ↗</a>` : ""}
      ${listSection("Strengths", problem.swot?.strengths)}${listSection("Risks", [...(problem.swot?.weaknesses || []), ...(problem.swot?.threats || [])])}${listSection("Opportunities", problem.swot?.opportunities)}
      <section class="detail-section" id="comments-section"><h3>Team comments</h3>${state.team ? '<div id="comment-list"><p>Loading comments…</p></div><form class="comment-form" id="comment-form"><textarea id="comment-body" maxlength="2000" required placeholder="Add a note for your team…"></textarea><div class="comment-row"><span class="gate-status" id="comment-status"></span><button class="primary-button" type="submit">Add comment</button></div></form>' : '<p>Create or join a team to read and leave comments.</p>'}</section>
    </aside></div>`;
}

function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState(history.state, "", path);
  else history.pushState({}, "", path);
  route();
}

function route() {
  const path = decodeURIComponent(location.pathname);
  const id = path.startsWith(DETAIL_PREFIX) ? path.slice(DETAIL_PREFIX.length).replace(/\/$/, "") : "";
  if (id) showDetail(id);
  else showList();
}

function showList() {
  state.view = "list";
  $("#list-view").hidden = false;
  $("#detail-view").hidden = true;
  if (!state.listLoaded) {
    list.hidden = false;
    $("#empty-state").hidden = true;
    list.innerHTML = '<div class="empty-state"><p>Loading statements…</p></div>';
    loadMetadataNonFatal();
    loadProblems();
    return;
  }
  render();
}

async function showDetail(id) {
  state.view = "detail";
  $("#list-view").hidden = true;
  $("#detail-view").hidden = false;
  $("#detail-number").textContent = id;
  $("#detail-star").dataset.star = id;
  $("#detail-star").classList.toggle("starred", state.starred.has(id));
  $("#detail-body").innerHTML = '<div class="empty-state"><p>Loading the full problem statement…</p></div>';
  window.scrollTo({ top: 0, behavior: "auto" });
  if (!/^SIH\d{5}$/.test(id)) {
    $("#detail-body").innerHTML = '<div class="empty-state"><h2>Unknown statement</h2><p>That problem statement number does not exist.</p></div>';
    return;
  }
  const cached = readCachedDetail(id);
  if (cached) {
    $("#detail-body").innerHTML = detailTemplate(cached);
    if (state.team) {
      $("#comment-form").addEventListener("submit", (event) => submitComment(event, id));
      loadComments(id);
    }
    return;
  }
  try {
    const problem = await api(`/api/problems/${encodeURIComponent(id)}`);
    if (state.view !== "detail" || $("#detail-star").dataset.star !== id) return;
    writeCachedDetail(id, problem);
    $("#detail-body").innerHTML = detailTemplate(problem);
    if (state.team) {
      $("#comment-form").addEventListener("submit", (event) => submitComment(event, id));
      loadComments(id);
    }
  } catch (error) {
    $("#detail-body").innerHTML = `<div class="empty-state"><h2>Could not open statement</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function toggleStar(id) {
  state.starred.has(id) ? state.starred.delete(id) : state.starred.add(id);
  localStorage.setItem("sih-starred", JSON.stringify([...state.starred]));
  if (state.view === "detail") {
    $("#detail-star").classList.toggle("starred", state.starred.has(id));
    return;
  }
  if (state.quick === "starred") loadProblems(); else render();
}

function clearFilters() {
  Object.assign(state, { search: "", theme: "", org: "", category: "", effort: "", innovation: "", verdict: "", from: "", to: "", quick: "" });
  loadProblems();
}

function filterChanged() {
  syncControls();
  syncUrl();
  loadProblems();
}

function bindEvents() {
  $("#search").addEventListener("input", (event) => { state.search = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(filterChanged, 300); });
  ["theme", "org", "effort", "innovation", "verdict", "sort"].forEach((key) => $(`#${key}`).addEventListener("change", (event) => { state[key] = event.target.value; filterChanged(); }));
  [["ps-from", "from"], ["ps-to", "to"]].forEach(([id, key]) => $(`#${id}`).addEventListener("change", (event) => { state[key] = event.target.value; filterChanged(); }));
  $("#category-filter").addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) { state.category = button.dataset.value; filterChanged(); } });
  document.querySelector(".quick-picks").addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) { state.quick = state.quick === button.dataset.quick ? "" : button.dataset.quick; filterChanged(); } });
  list.addEventListener("click", (event) => {
    const star = event.target.closest("[data-star]");
    if (star) return toggleStar(star.dataset.star);
    const card = event.target.closest("[data-open]");
    if (card) openStatement(card.dataset.open);
  });
  list.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-open]");
    if (card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openStatement(card.dataset.open); }
  });
  $("#active-filters").addEventListener("click", (event) => { const button = event.target.closest("[data-remove-filter]"); if (button) { state[button.dataset.removeFilter] = ""; filterChanged(); } });
  $("#load-more").addEventListener("click", () => loadProblems({ append: true }));
  $("#clear-filters").addEventListener("click", clearFilters);
  $("#empty-clear").addEventListener("click", clearFilters);
  $("#detail-back").addEventListener("click", () => { if (state.cameFromList) history.back(); else navigate("/"); });
  $("#detail-star").addEventListener("click", (event) => toggleStar(event.currentTarget.dataset.star));
  $("#mobile-filter-button").addEventListener("click", () => { filters.classList.add("open"); $("#filter-backdrop").hidden = false; });
  $("#filter-close").addEventListener("click", closeMobileFilters);
  $("#filter-backdrop").addEventListener("click", closeMobileFilters);
  $("#join-group-button").addEventListener("click", () => openTeamDialog(state.team ? "join" : "create"));
  $("#group-dialog-close").addEventListener("click", () => $("#group-dialog").close());
  $("#team-mode").addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) setTeamMode(button.dataset.mode); });
  $("#team-create-form").addEventListener("submit", (event) => submitTeam(event, "create"));
  $("#team-join-form").addEventListener("submit", (event) => submitTeam(event, "join"));
  $("#team-leave").addEventListener("click", leaveTeam);
  $("#auth-mode").addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) setAuthMode(button.dataset.mode); });
  $("#auth-form").addEventListener("submit", submitAuth);
  $("#logout-button").addEventListener("click", logout);
  window.addEventListener("popstate", route);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && filters.classList.contains("open")) closeMobileFilters();
    if (event.key === "/" && state.view === "list" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { event.preventDefault(); $("#search").focus(); }
  });
}

function openStatement(id) {
  state.cameFromList = state.view === "list";
  navigate(`${DETAIL_PREFIX}${encodeURIComponent(id)}`);
}

function closeMobileFilters() {
  filters.classList.remove("open");
  $("#filter-backdrop").hidden = true;
}

async function startApp() {
  $("#boot-screen").hidden = true;
  $("#access-gate").hidden = true;
  $("#group-bar").hidden = false;
  renderTeamBar();
  if (pendingRoute) {
    navigate(pendingRoute, { replace: true });
    pendingRoute = "";
  } else {
    await Promise.all([loadMetadataNonFatal(), loadProblems()]);
    route();
  }
}

function renderTeamBar() {
  const bar = $("#group-status");
  if (!state.team) {
    $("#group-name").textContent = "No team yet";
    bar.textContent = "Create or join a team to comment together.";
    $("#join-group-button").textContent = "Create or join team";
    return;
  }
  $("#group-name").textContent = state.team.name;
  bar.textContent = `${state.team.members} / ${state.team.maxMembers} members · Team Lead ${state.team.leaderName}`;
  $("#join-group-button").textContent = "View team";
}

function renderTeamPanel() {
  const inTeam = Boolean(state.team);
  $("#team-panel").hidden = !inTeam;
  $("#team-mode").hidden = inTeam;
  if (!inTeam) return;
  $("#team-create-form").hidden = true;
  $("#team-join-form").hidden = true;
  $("#team-panel-name").textContent = state.team.name;
  $("#team-panel-count").textContent = `${state.team.members} / ${state.team.maxMembers} Members`;
  $("#team-roster").innerHTML = Array.isArray(state.team.roster)
    ? state.team.roster.map((person) => `<li>${escapeHtml(person.name)}${person.isLead ? '<span class="lead-badge">Team Lead</span>' : ""}</li>`).join("")
    : "<li>Loading team roster…</li>";
  $("#team-full-note").hidden = !state.team.full;
}

async function loadFullTeam() {
  if (!state.team || Array.isArray(state.team.roster)) return;
  const result = await api("/api/team");
  state.team = result.team;
  renderTeamBar();
  renderTeamPanel();
}

function openTeamDialog(mode) {
  $("#team-status").textContent = "";
  $("#team-status").classList.remove("error");
  renderTeamPanel();
  if (!state.team) setTeamMode(mode);
  if (!$("#group-dialog").open) $("#group-dialog").showModal();
  if (state.team) loadFullTeam().catch((error) => {
    $("#team-status").textContent = error.message;
    $("#team-status").classList.add("error");
  });
}

function setTeamMode(mode) {
  document.querySelectorAll("#team-mode button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("#team-create-form").hidden = mode !== "create";
  $("#team-join-form").hidden = mode === "create";
}

async function submitTeam(event, action) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#team-status");
  const prefix = action === "create" ? "create" : "join";
  status.textContent = "";
  status.classList.remove("error");
  busy(form, true, action === "create" ? "Creating…" : "Joining…");
  try {
    const result = await api("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        teamName: $(`#${prefix}-team-name`).value,
        teamPassword: $(`#${prefix}-team-password`).value,
        displayName: $(action === "create" ? "#create-leader-name" : "#join-member-name").value,
      }),
    });
    state.team = result.team;
    renderTeamBar();
    renderTeamPanel();
    $(`#${prefix}-team-password`).value = "";
    toast(action === "create" ? "Team created successfully" : "You joined the team successfully");
    if (state.view === "detail") showDetail($("#detail-star").dataset.star);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  } finally {
    busy(form, false);
  }
}

async function leaveTeam() {
  const button = $("#team-leave");
  button.disabled = true;
  try {
    await api("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave" }) });
    state.team = null;
    renderTeamBar();
    renderTeamPanel();
    toast("You left the team");
    if (state.view === "detail") showDetail($("#detail-star").dataset.star);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function commentTemplate(comment) {
  return `<article class="comment"><span class="comment-meta"><strong>${escapeHtml(comment.display_name)}</strong> · ${new Date(comment.created_at).toLocaleString()}</span><p>${escapeHtml(comment.body)}</p></article>`;
}

async function loadComments(id) {
  try {
    const result = await api(`/api/comments?ps=${encodeURIComponent(id)}`);
    $("#comment-list").innerHTML = result.comments.length ? result.comments.map(commentTemplate).join("") : "<p>No comments yet. Start the discussion for your team.</p>";
  } catch (error) {
    $("#comment-list").innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

async function submitComment(event, id) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#comment-status");
  status.textContent = "";
  status.classList.remove("error");
  busy(form, true, "Posting…");
  try {
    await api(`/api/comments?ps=${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: $("#comment-body").value }) });
    $("#comment-body").value = "";
    toast("Comment added");
    await loadComments(id);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  } finally {
    busy(form, false);
  }
}

function setAuthMode(mode) {
  document.querySelectorAll("#auth-mode button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  const submit = $("#auth-submit");
  submit.dataset.mode = mode;
  submit.dataset.label = mode === "signup" ? "Create account" : "Log in";
  submit.textContent = submit.dataset.label;
  $("#auth-password").setAttribute("autocomplete", mode === "signup" ? "new-password" : "current-password");
  $("#gate-status").textContent = mode === "signup" ? "Passwords must be at least 8 characters." : "";
  $("#gate-status").classList.remove("error");
}

function showGate(message = "") {
  state.accessToken = "";
  state.team = null;
  $("#boot-screen").hidden = true;
  // Hide the app shell, not just cover it: otherwise the filters and search box
  // behind the gate stay in the tab order for a signed-out visitor.
  $("#list-view").hidden = true;
  $("#detail-view").hidden = true;
  $("#access-gate").hidden = false;
  $("#group-bar").hidden = true;
  $("#gate-status").textContent = message;
  $("#gate-status").classList.toggle("error", Boolean(message));
  $("#auth-submit").disabled = false;
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const action = $("#auth-submit").dataset.mode === "signup" ? "signup" : "login";
  const status = $("#gate-status");
  status.textContent = "";
  status.classList.remove("error");
  busy(form, true, action === "signup" ? "Creating account…" : "Signing in…");
  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action, email: $("#auth-email").value, password: $("#auth-password").value }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Could not ${action} (${response.status})`);
    if (result.pending) {
      status.textContent = result.message;
      return;
    }
    state.accessToken = result.accessToken;
    state.email = result.email || "";
    state.team = result.team || null;
    $("#auth-password").value = "";
    await startApp();
    toast(action === "signup" ? "Account created — welcome" : "Login successful");
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  } finally {
    busy(form, false);
  }
}

async function logout() {
  const button = $("#logout-button");
  button.disabled = true;
  const headers = { "Content-Type": "application/json" };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  try {
    await fetch("/api/auth", { method: "POST", headers, credentials: "same-origin", body: JSON.stringify({ action: "logout" }) });
  } catch {
    // The cookie is cleared server-side on any successful call; a network failure
    // still ends the local session below.
  } finally {
    button.disabled = false;
    history.replaceState({}, "", "/");
    state.view = "list";
    state.problems = [];
    showGate("You are logged out.");
  }
}

async function boot() {
  readUrl();
  bindEvents();
  setAuthMode("login");
  $("#boot-screen").hidden = false;
  $("#access-gate").hidden = true;
  // A protected deep link is remembered, then opened once authentication succeeds.
  if (location.pathname.startsWith(DETAIL_PREFIX)) pendingRoute = location.pathname;
  // Only a 401 means "not signed in". Anything else is the server or network having
  // a moment, so retry once rather than dropping the user back to the login screen.
  for (const attempt of [0, 1]) {
    try {
      await refreshAccessToken();
      break;
    } catch (error) {
      if (error.status === 401) return showGate();
      if (attempt === 1) return showGate(error.message);
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }
  try {
    await startApp();
  } catch (error) {
    toast(error.message, "error");
    route();
  }
}

boot();
