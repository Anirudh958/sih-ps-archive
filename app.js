const state = {
  problems: [],
  total: 0,
  page: 1,
  hasMore: false,
  accessToken: "",
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
  starred: new Set(JSON.parse(localStorage.getItem("sih-starred") || "[]")),
};

const $ = (selector) => document.querySelector(selector);
const list = $("#problem-list");
const filters = $("#filters");
const dialog = $("#detail-dialog");
const filterNames = { search: "Search", theme: "Theme", org: "Organization", category: "Category", effort: "Effort", innovation: "Innovation", verdict: "Verdict", from: "From PS", to: "To PS", quick: "Quick pick" };
let refreshRequest;
let searchTimer;
let listRequest;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
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
  const params = new URLSearchParams();
  ["search", "theme", "org", "category", "effort", "innovation", "verdict", "from", "to", "quick", "sort"].forEach((key) => {
    if (state[key] && !(key === "sort" && state[key] === "recommended")) params.set(key, state[key]);
  });
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
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
        if (!response.ok) throw new Error("Session expired");
        const result = await response.json();
        state.accessToken = result.accessToken;
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
    await refreshAccessToken();
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
    render();
  } catch (error) {
    if (error.name !== "AbortError") showListError(error.message);
  } finally {
    $("#load-more").disabled = false;
  }
}

function cardTemplate(problem) {
  const starred = state.starred.has(problem.ps_number);
  return `<article class="problem-card" data-id="${escapeHtml(problem.ps_number)}">
    <div><span class="ps-id">${escapeHtml(problem.ps_number)}</span><span class="ps-category">${escapeHtml(problem.category)}</span></div>
    <div class="card-main">
      <h2><button type="button" data-open="${escapeHtml(problem.ps_number)}">${escapeHtml(problem.title)}</button></h2>
      <p class="card-org">${escapeHtml(problem.org)} · ${escapeHtml(problem.theme)}</p>
      <p class="card-summary">${escapeHtml(problem.summary)}</p>
    </div>
    <div class="card-facts">
      <div class="fact"><span>Verdict</span><strong class="verdict ${problem.verdict?.toLowerCase() || "yellow"}">${escapeHtml(problem.verdict || "—")}</strong></div>
      <div class="fact"><span>Effort</span><strong>${escapeHtml(problem.effort || "—")}</strong></div>
      <div class="fact"><span>Innovation</span><strong>${escapeHtml(problem.innovation || "—")}</strong></div>
      ${problem.has_dataset ? '<div class="fact"><span>Data</span><strong class="dataset-dot">Available</strong></div>' : ""}
    </div>
    <button class="icon-button ${starred ? "starred" : ""}" type="button" data-star="${escapeHtml(problem.ps_number)}" aria-label="${starred ? "Remove star from" : "Star"} ${escapeHtml(problem.ps_number)}" title="${starred ? "Remove from shortlist" : "Add to shortlist"}">
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

function detailTemplate(problem) {
  const plan = Object.values(problem.build_plan_36h || {}).map((stage) => `<div class="plan-stage"><h4>${escapeHtml(stage.label)}</h4><ul>${(stage.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`).join("");
  return `<p class="detail-eyebrow">${escapeHtml(problem.org)}</p>
    <h2 id="detail-title">${escapeHtml(problem.title)}</h2>
    <div class="detail-tags"><span class="detail-tag">${escapeHtml(problem.category)}</span><span class="detail-tag">${escapeHtml(problem.theme)}</span><span class="detail-tag">${escapeHtml(problem.innovation_scope?.tier)} innovation</span><span class="detail-tag">${escapeHtml(problem.invention_effort?.tier)} effort</span></div>
    <div class="detail-grid"><div>
      <section class="detail-section"><h3>Problem decoded</h3><p>${escapeHtml(problem.problem_decode?.plain_summary || problem.description)}</p></section>
      <section class="detail-section"><h3>Background</h3><p>${escapeHtml(problem.background)}</p></section>
      <section class="detail-section"><h3>Official description</h3><p>${escapeHtml(problem.description).replaceAll("\n", "<br>")}</p></section>
      ${listSection("Expected solution", problem.expected_solution_bullets)}${listSection("Pain points", problem.problem_decode?.pain_points)}
      <section class="detail-section"><h3>Competitive landscape</h3><p><strong>${escapeHtml(problem.competitive_landscape?.tier || "—")} competition.</strong> ${escapeHtml(problem.competitive_landscape?.reason)}</p><p>${escapeHtml(problem.competitive_landscape?.differentiation_angle)}</p></section>
      <section class="detail-section"><h3>36-hour build plan</h3>${plan}</section>${listSection("Questions evaluators may ask", problem.evaluator_questions)}
    </div><aside>
      <div class="verdict-panel"><span class="verdict ${problem.verdict?.tier?.toLowerCase() || "yellow"}">${escapeHtml(problem.verdict?.tier || "—")}</span><strong>${escapeHtml(problem.verdict?.why)}</strong><p>${escapeHtml(problem.verdict?.validate)}</p></div>
      <div class="mini-stat"><span>Invention effort</span><strong>${escapeHtml(problem.invention_effort?.tier || "—")} · score ${escapeHtml(problem.invention_effort?.score ?? "—")}</strong></div>
      <div class="mini-stat"><span>Innovation scope</span><strong>${escapeHtml(problem.innovation_scope?.tier || "—")}</strong></div>
      <div class="mini-stat"><span>Competition</span><strong>${escapeHtml(problem.competitive_landscape?.tier || "—")}</strong></div>
      <div class="mini-stat"><span>Ideas submitted</span><strong>${escapeHtml(problem.ideas || "—")}</strong></div>
      <div class="mini-stat"><span>Deadline</span><strong>${escapeHtml(problem.deadline || "—")}</strong></div>
      ${problem.dataset_link ? `<a class="detail-link" href="${escapeHtml(problem.dataset_link)}" target="_blank" rel="noreferrer">Open official dataset ↗</a>` : ""}
      ${listSection("Strengths", problem.swot?.strengths)}${listSection("Risks", [...(problem.swot?.weaknesses || []), ...(problem.swot?.threats || [])])}${listSection("Opportunities", problem.swot?.opportunities)}
      <section class="detail-section" id="comments-section"><h3>Team comments</h3>${state.team ? '<div id="comment-list"><p>Loading comments…</p></div><form class="comment-form" id="comment-form"><textarea id="comment-body" maxlength="2000" required placeholder="Add a note for your team…"></textarea><div class="comment-row"><span class="gate-status" id="comment-status"></span><button class="primary-button" type="submit">Add comment</button></div></form>' : '<p>Create or join a team to read and leave comments.</p>'}</section>
    </aside></div>`;
}

async function openDetail(id) {
  $("#detail-number").textContent = id;
  $("#dialog-content").innerHTML = '<div class="empty-state"><p>Loading statement…</p></div>';
  $("#detail-star").dataset.star = id;
  $("#detail-star").classList.toggle("starred", state.starred.has(id));
  if (!dialog.open) dialog.showModal();
  try {
    const problem = await api(`/api/problems/${encodeURIComponent(id)}`);
    if (dialog.open && $("#detail-star").dataset.star === id) {
      $("#dialog-content").innerHTML = detailTemplate(problem);
      if (state.team) {
        $("#comment-form").addEventListener("submit", (event) => submitComment(event, id));
        loadComments(id);
      }
    }
  } catch (error) {
    $("#dialog-content").innerHTML = `<div class="empty-state"><h2>Could not open statement</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function toggleStar(id) {
  state.starred.has(id) ? state.starred.delete(id) : state.starred.add(id);
  localStorage.setItem("sih-starred", JSON.stringify([...state.starred]));
  if (state.quick === "starred") loadProblems(); else render();
  if (dialog.open && $("#detail-star").dataset.star === id) $("#detail-star").classList.toggle("starred", state.starred.has(id));
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
  list.addEventListener("click", (event) => { const star = event.target.closest("[data-star]"); const open = event.target.closest("[data-open]"); if (star) toggleStar(star.dataset.star); if (open) openDetail(open.dataset.open); });
  $("#active-filters").addEventListener("click", (event) => { const button = event.target.closest("[data-remove-filter]"); if (button) { state[button.dataset.removeFilter] = ""; filterChanged(); } });
  $("#load-more").addEventListener("click", () => loadProblems({ append: true }));
  $("#clear-filters").addEventListener("click", clearFilters);
  $("#empty-clear").addEventListener("click", clearFilters);
  $("#dialog-close").addEventListener("click", () => dialog.close());
  $("#detail-star").addEventListener("click", (event) => toggleStar(event.currentTarget.dataset.star));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  $("#mobile-filter-button").addEventListener("click", () => { filters.classList.add("open"); $("#filter-backdrop").hidden = false; });
  $("#filter-close").addEventListener("click", closeMobileFilters);
  $("#filter-backdrop").addEventListener("click", closeMobileFilters);
  $("#join-group-button").addEventListener("click", () => openTeamDialog(state.team ? "join" : "create"));
  $("#group-dialog-close").addEventListener("click", () => $("#group-dialog").close());
  $("#team-mode").addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) setTeamMode(button.dataset.mode); });
  $("#team-create-form").addEventListener("submit", (event) => submitTeam(event, "create"));
  $("#team-join-form").addEventListener("submit", (event) => submitTeam(event, "join"));
  $("#gate-retry").addEventListener("click", createSession);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && filters.classList.contains("open")) closeMobileFilters();
    if (event.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { event.preventDefault(); $("#search").focus(); }
  });
}

function closeMobileFilters() {
  filters.classList.remove("open");
  $("#filter-backdrop").hidden = true;
}

async function startApp() {
  const metadata = await api("/api/filters");
  populateSelect("#theme", metadata.themes);
  populateSelect("#org", metadata.orgs);
  $("#total-count").textContent = metadata.stats.total;
  $("#theme-count").textContent = metadata.stats.themes;
  $("#org-count").textContent = metadata.stats.orgs;
  $("#access-gate").hidden = true;
  $("#group-bar").hidden = false;
  renderTeamBar();
  if (!state.team) openTeamDialog("create");
  await loadProblems();
}

function renderTeamBar() {
  if (!state.team) return;
  $("#group-name").textContent = state.team.name;
  $("#group-status").textContent = `${state.team.members} of ${state.team.maxMembers} members · led by ${state.team.leaderName}`;
  $("#join-group-button").textContent = "Switch team";
}

function openTeamDialog(mode) {
  setTeamMode(mode);
  $("#team-status").textContent = "";
  $("#team-status").classList.remove("error");
  if (!$("#group-dialog").open) $("#group-dialog").showModal();
}

function setTeamMode(mode) {
  document.querySelectorAll("#team-mode button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("#team-create-form").hidden = mode !== "create";
  $("#team-join-form").hidden = mode === "create";
}

async function submitTeam(event, action) {
  event.preventDefault();
  const status = $("#team-status");
  const prefix = action === "create" ? "create" : "join";
  status.textContent = action === "create" ? "Creating team…" : "Joining team…";
  status.classList.remove("error");
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
    $(`#${prefix}-team-password`).value = "";
    $("#group-dialog").close();
    if (dialog.open) openDetail($("#detail-star").dataset.star);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  }
}

function commentTemplate(comment) {
  return `<article class="comment"><span class="comment-meta"><strong>${escapeHtml(comment.display_name)}</strong> · ${new Date(comment.created_at).toLocaleString()}</span><p>${escapeHtml(comment.body)}</p></article>`;
}

async function loadComments(id) {
  try {
    const result = await api(`/api/comments?ps=${encodeURIComponent(id)}`);
    $("#comment-list").innerHTML = result.comments.length ? result.comments.map(commentTemplate).join("") : "<p>No comments yet.</p>";
  } catch (error) {
    $("#comment-list").innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

async function submitComment(event, id) {
  event.preventDefault();
  const status = $("#comment-status");
  status.textContent = "Posting…";
  try {
    await api(`/api/comments?ps=${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: $("#comment-body").value }) });
    $("#comment-body").value = "";
    status.textContent = "Comment added.";
    await loadComments(id);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  }
}

async function createSession() {
  const status = $("#gate-status");
  status.textContent = "Opening a protected session…";
  status.classList.remove("error");
  $("#gate-retry").hidden = true;
  try {
    const response = await fetch("/api/session", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Could not open a session (${response.status})`);
    const result = await response.json();
    state.accessToken = result.accessToken;
    state.team = result.team || null;
    await startApp();
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
    $("#gate-retry").hidden = false;
  }
}

async function initGate() {
  readUrl();
  bindEvents();
  try {
    await refreshAccessToken();
    await startApp();
  } catch {
    state.accessToken = "";
    await createSession();
  }
}

initGate();
