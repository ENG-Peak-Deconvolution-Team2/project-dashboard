/*
 * ENG project dashboard — application logic (all UI strings English).
 *
 * This script owns only dynamic content inside the static containers shipped
 * by index.html. Panel shells, nav buttons, the team/week filters and all
 * container elements are static; nothing here clones or moves them. Every
 * JSON value is rendered with document.createElement + textContent, and every
 * link is sanitized to http(s) or relative same-site paths before use.
 *
 * Public data schema (fetched from "data/project.json"):
 * {
 *   "project": {
 *     "name": string, "description": string, "lead": string,
 *     "updated": "YYYY-MM-DD",            // last content update (footer)
 *     "planVerified": "YYYY-MM-DD",
 *     "weeks": number,                    // planned weeks, e.g. 15
 *     "startDate": string|null, "repositoryUrl": string|null, "siteUrl": string|null
 *   },
 *   "teams": [{
 *     "id": "team1", "name": string, "approach": string,
 *     "members": [{ "name": string, "department": string }]
 *   }],
 *   "packages": [{
 *     "id": "WP1", "name": string, "shortName": string,
 *     "summary": string, "color": "#rrggbb",
 *     "tasks": [{
 *       "id": "WP1.1", "name": string,
 *       "weeks": number[],                // planned weeks (week 8 is a break)
 *       "owner": string,                  // department lead, e.g. "BME+EEE"
 *       "modelling": boolean,
 *       "status": { "<teamId>": string }, // initially "Not reported"
 *       "outputs": (string | { "label": string, "href": string })[]
 *     }]
 *   }],
 *   "milestones": [{ "week": number, "title": string,
 *                    "type": "presentation" | "midterm" }],
 *   "experiments": [{ "id", "title", "team", "dataset", "task", "model",
 *                     "date", "metrics": [{ "name", "value", "unit" }],
 *                     "notes", "href" }],
 *   "resources": [{ "id", "type", "title", "description", "href"?, "label"? }],
 *   "decisions": [{ "date", "title", "summary", "actions": [] }],
 *   "meetings": [{ "date", "title", "summary",
 *                  "actions": [{ "title", "owner", "due", "status" }] }]
 * }
 */
"use strict";

const DATA_URL = "data/project.json";
const ROUTES = ["overview", "schedule", "packages", "results", "resources", "journal"];
const WEEKS_FALLBACK = 15;
const DEFAULT_WEEK = 2;

let data = null;
let presentationWeeks = new Set();
let midtermWeeks = new Set();
const state = { team: "team2", week: DEFAULT_WEEK };

/* ---------------- small helpers ---------------- */

function byId(id) { return document.getElementById(id); }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/* Accept only http(s) URLs and relative same-site paths. */
function safeHref(url) {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (!u || /[\u0000-\u001f\\]/.test(u) || u.startsWith("//")) return null;
  try {
    const parsed = new URL(u, document.baseURI);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return u;
  } catch { return null; }
}

function anchor(href, label) {
  const a = el("a", null, label);
  a.href = href;
  if (/^https:\/\//i.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
  return a;
}

function option(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

/* ---------------- derived data helpers ---------------- */

function totalWeeks() {
  const w = Number(data.project && data.project.weeks);
  return Number.isInteger(w) && w > 0 ? w : WEEKS_FALLBACK;
}

function tasksOf() {
  const out = [];
  for (const pkg of data.packages || []) for (const t of pkg.tasks || []) out.push({ pkg, t });
  return out;
}

function tasksInWeek(week) {
  return tasksOf().filter(({ t }) => (t.weeks || []).includes(week));
}

function packageWeeks(pkg) {
  const set = new Set();
  for (const t of pkg.tasks || []) for (const w of t.weeks || []) if (Number.isFinite(w)) set.add(w);
  return [...set].sort((a, b) => a - b);
}

function scopeTeams() {
  const teams = data.teams || [];
  return state.team === "all" ? teams : teams.filter((t) => t.id === state.team);
}

function teamById(id) { return (data.teams || []).find((t) => t.id === id); }

function teamShort(team) {
  const id = String(team.id || team.name || "");
  const m = id.match(/^team(\d+)$/i);
  return m ? "T" + m[1] : (id || "team").toUpperCase();
}

function statusFor(task, teamId) {
  const s = task.status && typeof task.status === "object" ? task.status[teamId] : null;
  return typeof s === "string" && s ? s : "Not reported";
}

function formatWeeks(weeks) {
  const ws = [...new Set((weeks || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!ws.length) return "Weeks not set";
  const parts = [];
  let start = ws[0]; let prev = ws[0];
  for (const w of ws.slice(1)) {
    if (w === prev + 1) { prev = w; continue; }
    parts.push(start === prev ? String(start) : start + "–" + prev);
    start = w; prev = w;
  }
  parts.push(start === prev ? String(start) : start + "–" + prev);
  return (ws.length === 1 ? "Week " : "Weeks ") + parts.join(", ");
}

function modellingLabel(task) {
  if (!task.modelling) return null;
  if (state.team === "all") return "T1 DL / T2 ML";
  const team = teamById(state.team);
  return team && team.approach ? team.approach : null;
}

function weekModifiers(w) {
  const c = [];
  if (w === state.week) c.push("selected-week");
  if (presentationWeeks.has(w)) c.push("presentation-week");
  if (midtermWeeks.has(w)) c.push("midterm-week");
  return c;
}

/* ---------------- top controls (team / planning week) ---------------- */

function wireControls() {
  const teamSel = byId("team-filter");
  const weekSel = byId("week-filter");
  if (teamSel) teamSel.addEventListener("change", () => {
    state.team = teamSel.value || "all";
    renderAll();
  });
  if (weekSel) weekSel.addEventListener("change", () => {
    const w = parseInt(weekSel.value, 10);
    if (Number.isFinite(w)) { state.week = w; renderAll(); }
  });
}

function ensureControls() {
  const weekSel = byId("week-filter");
  if (weekSel) {
    if (weekSel.options.length === 0) {
      for (let w = 1; w <= totalWeeks(); w++) weekSel.appendChild(option(String(w), "Week " + w));
    }
    if (![...weekSel.options].some((o) => o.value === String(state.week))) {
      state.week = parseInt(weekSel.options[0] && weekSel.options[0].value, 10) || DEFAULT_WEEK;
    }
    weekSel.value = String(state.week);
  }
  const teamSel = byId("team-filter");
  if (teamSel) {
    if (teamSel.options.length === 0) {
      teamSel.appendChild(option("all", "All teams"));
      for (const t of data.teams || []) teamSel.appendChild(option(t.id, t.name));
    }
    if (![...teamSel.options].some((o) => o.value === state.team)) state.team = "all";
    teamSel.value = state.team;
  }
}

/* ---------------- renderers ---------------- */

function renderStats() {
  const box = byId("overview-stats");
  if (!box) return;
  clear(box);
  const stats = [
    ["work packages", (data.packages || []).length],
    ["planned tasks", tasksOf().length],
    ["weeks", totalWeeks()],
    ["team members", scopeTeams().reduce((n, team) => n + (team.members || []).length, 0)],
  ];
  for (const [label, value] of stats) {
    const item = el("div", "stat");
    item.append(
      el("div", "stat-value", String(value)),
      el("div", "stat-label", label)
    );
    box.appendChild(item);
  }
}

function renderPackagesOverview() {
  const box = byId("overview-packages");
  if (!box) return;
  clear(box);
  const table = el("table", "programme-table");
  const columns = el("colgroup");
  for (const width of ["7%", "40%", ...Array(15).fill("3.5333%")]) {
    const column = el("col"); column.style.width = width; columns.appendChild(column);
  }
  table.appendChild(columns);
  table.appendChild(el("caption", "visually-hidden", "Planned work package activity"));
  const thead = el("thead");
  const headRow = el("tr");
  const pkgHead = el("th", null, "Package");
  pkgHead.scope = "col";
  pkgHead.colSpan = 2;
  headRow.appendChild(pkgHead);
  for (let w = 1; w <= totalWeeks(); w++) {
    const th = el("th", null, "W" + w);
    th.scope = "col";
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = el("tbody");
  for (const pkg of data.packages || []) {
    const weeks = packageWeeks(pkg);
    const row = el("tr", "programme-row");
    row.dataset.wp = pkg.id;
    if (pkg.color) row.style.setProperty("--wp", pkg.color);
    row.appendChild(el("td", "wp-code", pkg.id));
    const scopeHead = el("th", null);
    scopeHead.scope = "row";
    const btn = el("button", "programme-title", pkg.name);
    btn.type = "button";
    btn.dataset.go = "packages";
    btn.dataset.wp = pkg.id;
    scopeHead.appendChild(btn);
    row.appendChild(scopeHead);
    for (let w = 1; w <= totalWeeks(); w++) {
      let cls = "programme-week";
      if (w === state.week) cls += " selected-week";
      if (midtermWeeks.has(w)) cls += " midterm-week";
      const cell = el("td", cls);
      cell.setAttribute("aria-label", `${pkg.id}, week ${w}: ${weeks.includes(w) ? "planned" : "no activity scheduled"}`);
      if (weeks.includes(w)) {
        const mark = el("span", "programme-mark");
        mark.title = pkg.id + ": " + pkg.name + " — planned for week " + w;
        cell.appendChild(mark);
      }
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  box.appendChild(table);
}

function renderFocus() {
  const box = byId("overview-focus");
  if (!box) return;
  clear(box);
  const items = tasksInWeek(state.week);
  if (!items.length) {
    box.appendChild(el("div", "empty-state", midtermWeeks.has(state.week)
      ? `Week ${state.week} is the midterm week; no tasks are scheduled.`
      : `No tasks are scheduled for week ${state.week}.`));
    return;
  }
  for (const { pkg, t } of items) {
    const item = el("div", "focus-item");
    item.style.setProperty("--wp", pkg.color);
    item.append(
      el("span", "wp-code", t.id),
      el("span", "focus-title", t.name),
      el("span", "focus-owner", t.owner || "Not assigned")
    );
    box.appendChild(item);
  }
}

function renderMilestones() {
  const box = byId("overview-milestones");
  if (!box) return;
  clear(box);
  const upcoming = (data.milestones || [])
    .filter((m) => Number.isFinite(m.week) && m.week >= state.week)
    .sort((a, b) => a.week - b.week);
  if (!upcoming.length) {
    box.appendChild(el("div", "empty-state", `No milestones are scheduled from week ${state.week} onward.`));
    return;
  }
  for (const m of upcoming.slice(0, 4)) {
    const item = el("div", "milestone" + (m.type === "midterm" ? " midterm" : ""));
    item.append(
      el("span", "milestone-week", "Week " + m.week),
      el("span", "milestone-title", m.title || "Milestone"),
      el("span", "milestone-type", m.type || "")
    );
    box.appendChild(item);
  }
}

function renderTeams() {
  const box = byId("overview-team");
  if (!box) return;
  clear(box);
  const lead = data.project && data.project.lead;
  for (const team of scopeTeams()) {
    const card = el("div", "team-card");
    card.dataset.team = team.id;
    card.append(
      el("h3", "team-name", team.name),
      el("div", "team-approach", team.approach || "")
    );
    const ul = el("ul", "team-members");
    for (const m of team.members || []) {
      const li = el("li", "team-member");
      const name = el("span", "member-name", m.name);
      if (lead && m.name === lead) name.appendChild(el("span", "lead-badge", "Project lead"));
      li.append(name, el("span", "member-dept", m.department || ""));
      ul.appendChild(li);
    }
    card.appendChild(ul);
    box.appendChild(card);
  }
}

function renderSchedule() {
  const box = byId("schedule-table");
  if (!box) return;
  clear(box);
  const total = totalWeeks();
  const team = state.team === "all" ? null : teamById(state.team);
  const table = el("table", "gantt-table");
  table.appendChild(el("caption", "gantt-caption", team
    ? `Work plan, weeks 1–${total}. Method shown for ${team.name}${team.approach ? " (" + team.approach + ")" : ""}; the schedule is shared by all teams.`
    : `Work plan, weeks 1–${total}. Shared by all teams.`));
  const thead = el("thead");
  const hrow = el("tr");
  const c1 = el("th", "gantt-col-task", "Package / task"); c1.scope = "col";
  const c2 = el("th", "gantt-col-owner", "Owner"); c2.scope = "col";
  hrow.append(c1, c2);
  for (let w = 1; w <= total; w++) {
    const th = el("th", ["gantt-week", ...weekModifiers(w)].join(" "), "W" + w);
    th.scope = "col";
    th.setAttribute("aria-label", "Week " + w);
    hrow.appendChild(th);
  }
  thead.appendChild(hrow);
  const tbody = el("tbody");
  for (const pkg of data.packages || []) {
    const grow = el("tr", "gantt-group");
    const gth = el("th", "gantt-group-label", `${pkg.id} — ${pkg.name}`);
    gth.colSpan = 2 + total;
    gth.scope = "rowgroup";
    grow.appendChild(gth);
    tbody.appendChild(grow);
    for (const t of pkg.tasks || []) {
      const tr = el("tr", "gantt-task");
      tr.style.setProperty("--wp", pkg.color);
      tr.dataset.task = t.id;
      const name = el("th", "gantt-task-name", `${t.id} ${t.name}`);
      name.scope = "row";
      const label = modellingLabel(t);
      if (label) name.appendChild(el("span", "modelling-tag", label));
      tr.append(name, el("td", "gantt-owner", t.owner || "Not assigned"));
      for (let w = 1; w <= total; w++) {
        const active = (t.weeks || []).includes(w) && !midtermWeeks.has(w);
        const td = el("td", ["gantt-cell", ...weekModifiers(w)].join(" "));
        if (active) {
          td.appendChild(el("div", "gantt-bar"));
          td.setAttribute("aria-label", `${t.name}, planned for week ${w}`);
        } else {
          td.setAttribute("aria-hidden", "true");
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }
  table.append(thead, tbody);
  box.appendChild(table);
}

function renderWeekly() {
  const box = byId("weekly-list");
  if (!box) return;
  clear(box);
  const items = tasksInWeek(state.week);
  if (!items.length) {
    box.appendChild(el("div", "empty-state", midtermWeeks.has(state.week)
      ? `Week ${state.week} is the midterm week; no tasks are scheduled.`
      : `No tasks are scheduled for week ${state.week}.`));
    return;
  }
  for (const { pkg, t } of items) {
    const item = el("div", "weekly-task");
    item.style.setProperty("--wp", pkg.color);
    item.append(
      el("span", "wp-code", t.id),
      el("span", "weekly-title", t.name),
      el("span", "weekly-owner", t.owner || "Not assigned")
    );
    const method = modellingLabel(t);
    if (method) item.appendChild(el("span", "modelling-tag", method));
    box.appendChild(item);
  }
}

function outputLink(o) {
  let href = typeof o === "string" ? o : (o && (o.href || o.url));
  let label = typeof o === "string" ? "Output" : (o && (o.label || o.title)) || "Output";
  const safe = safeHref(href);
  return safe ? anchor(safe, label) : null;
}

function renderPackages() {
  const box = byId("package-list");
  if (!box) return;
  const existing = [...box.querySelectorAll(":scope > details")];
  const openPackages = new Set(existing.filter(item => item.open).map(item => item.dataset.wp));
  clear(box);
  const teams = scopeTeams();
  (data.packages || []).forEach((pkg, i) => {
    const details = el("details", "work-package");
    details.style.setProperty("--wp", pkg.color);
    details.dataset.wp = pkg.id;
    details.open = existing.length ? openPackages.has(pkg.id) : i === 0;
    const summary = el("summary", "package-summary-head");
    summary.append(
      el("span", "wp-code", pkg.id),
      el("span", "package-title", pkg.name),
      el("span", "package-count", `${(pkg.tasks || []).length} tasks`)
    );
    const statusParts = teams.map((team) => {
      const set = [...new Set((pkg.tasks || []).map((t) => statusFor(t, team.id)))];
      return `${teamShort(team)}: ${set.join(", ")}`;
    });
    summary.appendChild(el("span", "package-status", statusParts.join(" · ")));
    const body = el("div", "package-body");
    if (pkg.summary) body.appendChild(el("p", "package-summary-text", pkg.summary));
    for (const t of pkg.tasks || []) {
      const row = el("div", "task-detail");
      row.append(
        el("span", "task-id", t.id),
        el("span", "task-title", t.name),
        el("span", "task-weeks", formatWeeks(t.weeks)),
        el("span", "task-owner", t.owner || "Not assigned")
      );
      const statuses = el("span", "task-statuses");
      for (const team of teams) {
        const status = statusFor(t, team.id);
        const badge = el("span", "task-status status-" + status.toLowerCase().replace(/\s+/g, "-"), `${teamShort(team)}: ${status}`);
        badge.dataset.team = team.id;
        statuses.appendChild(badge);
      }
      row.appendChild(statuses);
      const outputs = (t.outputs || []).map(outputLink).filter(Boolean);
      if (outputs.length) {
        const span = el("span", "task-outputs");
        for (const a of outputs) span.appendChild(a);
        row.appendChild(span);
      }
      body.appendChild(row);
    }
    details.append(summary, body);
    box.appendChild(details);
  });
}

function renderResults() {
  const box = byId("results-list");
  if (!box) return;
  clear(box);
  const exps = (data.experiments || []).filter(x => state.team === "all" || x.team === state.team);
  if (!exps.length) {
    const empty = el("div", "empty-state");
    empty.append(
      el("h3", null, "No results recorded yet"),
      el("p", "result-empty-note", "Recorded experiments for this team view will appear here with their dataset, method and evaluation metrics.")
    );
    box.appendChild(empty);
    return;
  }
  for (const x of exps) {
    const card = el("div", "result-card");
    if (x.id) card.dataset.result = x.id;
    card.appendChild(el("h3", "result-title", x.title || x.id || "Untitled experiment"));
    const meta = [["Team", teamById(x.team)?.name || x.team], ["Dataset", x.dataset], ["Task", x.task],
      ["Model", x.model], ["Date", x.date]].filter(([, v]) => v);
    if (meta.length) {
      const dl = el("dl", "result-meta");
      for (const [k, v] of meta) dl.append(el("dt", null, k), el("dd", null, v));
      card.appendChild(dl);
    }
    if (Array.isArray(x.metrics) && x.metrics.length) {
      const list = el("ul", "result-metrics");
      for (const m of x.metrics) {
        const metric = el("li", "metric");
        metric.append(
          el("span", "metric-name", m.name || ""),
          el("span", "metric-value", [m.value, m.unit].filter(v => v !== null && v !== undefined && v !== "").join(" "))
        );
        list.appendChild(metric);
      }
      card.appendChild(list);
    }
    if (x.notes) card.appendChild(el("p", "result-notes", x.notes));
    const safe = safeHref(x.href);
    if (safe) card.appendChild(anchor(safe, "Open record"));
    box.appendChild(card);
  }
}

function renderResources() {
  const box = byId("resources-list");
  if (!box) return;
  clear(box);
  const res = data.resources || [];
  if (!res.length) {
    box.appendChild(el("div", "empty-state", "No resources listed yet."));
    return;
  }
  const groups = new Map();
  for (const r of res) {
    const type = typeof r.type === "string" && r.type ? r.type : "other";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(r);
  }
  for (const [type, items] of groups) {
    const section = el("section", "resource-section");
    const headings = {document:"Documents", dataset:"Datasets", literature:"Literature"};
    section.appendChild(el("h2", "resource-section-title", headings[type] || type));
    const grid = el("div", "resource-grid");
    for (const r of items) {
      const card = el("div", "resource-card");
      card.append(
        el("span", "resource-type", type),
        el("h3", "resource-title", r.title || "Untitled resource")
      );
      if (r.description) card.appendChild(el("p", "resource-description", r.description));
      const safe = safeHref(r.href);
      if (safe) card.appendChild(anchor(safe, r.label || "Open resource"));
      grid.appendChild(card);
    }
    section.appendChild(grid);
    box.appendChild(section);
  }
  if (!groups.has("literature")) {
    const section = el("section", "resource-section");
    section.append(el("h2", "resource-section-title", "Literature"), el("p", null, "No literature references have been added to this workspace yet."));
    box.appendChild(section);
  }
}

function renderJournal() {
  const box = byId("journal-list");
  if (!box) return;
  clear(box);
  const entries = [];
  for (const d of data.decisions || []) entries.push({ kind: "Decision", date: d.date, title: d.title, summary: d.summary, actions: d.actions || [] });
  for (const m of data.meetings || []) entries.push({ kind: "Meeting", date: m.date, title: m.title, summary: m.summary, actions: m.actions || [] });
  entries.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  if (!entries.length) box.appendChild(el("div", "empty-state", "No decisions or meetings recorded yet."));
  for (const e of entries) {
    const card = el("article", "journal-entry");
    card.dataset.kind = e.kind;
    card.appendChild(el("span", "entry-kind", e.kind));
    if (e.date) card.appendChild(el("time", "entry-date", e.date));
    card.appendChild(el("h3", "entry-title", e.title || "Untitled"));
    if (e.summary) card.appendChild(el("p", "entry-summary", e.summary));
    if (e.actions.length) {
      const ul = el("ul", "entry-actions");
      for (const a of e.actions) {
        const li = el("li", "entry-action");
        li.appendChild(el("span", "action-title", a.title || ""));
        const meta = [a.owner, a.due && ("due " + a.due), a.status].filter(Boolean).join(" · ");
        if (meta) li.appendChild(el("span", "action-meta", meta));
        ul.appendChild(li);
      }
      card.appendChild(ul);
    }
    box.appendChild(card);
  }
  if (!(data.meetings || []).length) {
    box.appendChild(el("div", "empty-state", "No meetings recorded yet."));
  }
}

function renderWeekLabels() {
  for (const node of document.querySelectorAll("[data-selected-week]")) {
    node.textContent = String(state.week);
  }
}

function renderMeta() {
  const footer = byId("footer-updated");
  if (footer) footer.textContent = (data.project && data.project.updated) || "Unknown";
  const repo = byId("repository-link");
  if (!repo) return;
  const safe = safeHref(data.project && data.project.repositoryUrl);
  if (safe) {
    repo.href = safe;
    if (/^https:\/\//i.test(safe)) { repo.target = "_blank"; repo.rel = "noopener noreferrer"; }
    repo.removeAttribute("hidden");
  } else {
    repo.setAttribute("hidden", "");
  }
}

function renderAll() {
  if (!data) return;
  renderStats();
  renderPackagesOverview();
  renderFocus();
  renderMilestones();
  renderTeams();
  renderSchedule();
  renderWeekly();
  renderPackages();
  renderResults();
  renderResources();
  renderJournal();
  renderWeekLabels();
  renderMeta();
}

/* ---------------- hash / Bootstrap tab navigation ---------------- */

function navButtons() {
  return Array.from(document.querySelectorAll('[data-bs-toggle="tab"][data-route]'));
}

function activeRoute() {
  const b = navButtons().find((n) => n.classList.contains("active"));
  return b ? b.dataset.route : "overview";
}

function routeFromHash() {
  const h = location.hash.replace(/^#/, "");
  return ROUTES.includes(h) ? h : "overview";
}

function syncChrome(route) {
  for (const b of navButtons()) {
    if (b.dataset.route === route) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  const btn = document.querySelector(`[data-bs-toggle="tab"][data-route="${route}"]`);
  const title = byId("page-title");
  if (title && btn) title.textContent = btn.querySelector(":scope > span:last-child").textContent;
}

/* pushState only when the URL is out of sync (i.e. user changed tabs);
   programmatic shows triggered by hash navigation never push again. */
function setHash(route) {
  const hash = "#" + route;
  if (location.hash === hash) return;
  try { history.pushState(null, "", hash); }
  catch (e) { location.hash = hash; }
}

function showTab(route) {
  if (!window.bootstrap || !window.bootstrap.Tab) return;
  const btn = document.querySelector(`[data-bs-toggle="tab"][data-route="${route}"]`);
  if (btn) window.bootstrap.Tab.getOrCreateInstance(btn).show();
}

function onBrowserNav() {
  const r = routeFromHash();
  if (location.hash !== "#" + r) history.replaceState(null, "", "#" + r);
  if (r !== activeRoute()) showTab(r);
  else syncChrome(r);
}

function focusPackage(wp) {
  const esc = window.CSS && CSS.escape ? CSS.escape(wp) : wp;
  const details = document.querySelector('.work-package[data-wp="' + esc + '"]');
  if (!details) return;
  const open = () => {
    details.open = true;
    const s = details.querySelector("summary");
    if (s) s.focus();
  };
  if (activeRoute() === "packages") open();
  else {
    const btn = document.querySelector('[data-bs-toggle="tab"][data-route="packages"]');
    if (btn) btn.addEventListener("shown.bs.tab", open, { once: true });
  }
}

function wireTabs() {
  document.addEventListener("shown.bs.tab", (e) => {
    const route = e.target && e.target.dataset ? e.target.dataset.route : null;
    if (!route) return;
    syncChrome(route);
    setHash(route);
  });
  window.addEventListener("popstate", onBrowserNav);
  window.addEventListener("hashchange", onBrowserNav);
  document.addEventListener("click", (e) => {
    const target = e.target && e.target.closest ? e.target.closest("[data-go]") : null;
    if (!target) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const route = ROUTES.includes(target.dataset.go) ? target.dataset.go : "overview";
    e.preventDefault();
    showTab(route);
    if (route === "packages" && target.dataset.wp) focusPackage(target.dataset.wp);
  });
}

/* ---------------- data loading ---------------- */

function setStatusAlert(message, visible) {
  let box = byId("data-status");
  if (!box && visible) {
    box = el("div", "alert alert-danger", null);
    box.id = "data-status";
    document.body.prepend(box);
  }
  if (!box) return;
  box.textContent = message;
  if (visible) { box.removeAttribute("hidden"); box.classList.remove("d-none", "invisible"); }
  else box.setAttribute("hidden", "");
}

function indexMilestones() {
  presentationWeeks = new Set();
  midtermWeeks = new Set();
  for (const m of data.milestones || []) {
    if (typeof m.week !== "number") continue;
    if (m.type === "presentation") presentationWeeks.add(m.week);
    if (m.type === "midterm") midtermWeeks.add(m.week);
  }
}

async function initialise() {
  wireTabs();
  onBrowserNav();
  wireControls();
  try {
    const response = await fetch(DATA_URL, {cache:"no-cache"});
    if (!response.ok) throw new Error("Project data is unavailable.");
    data = await response.json();
    if (!data.project || !Array.isArray(data.packages) || !Array.isArray(data.teams)) {
      throw new Error("Invalid project data.");
    }
    state.team = byId("team-filter").value;
    indexMilestones();
    ensureControls();
    renderAll();
    setStatusAlert("", false);
  } catch (error) {
    clear(byId("overview-stats"));
    setStatusAlert("The project data could not be loaded. Refresh the page to try again. The Excel work plan is still available above.", true);
  }
}

initialise();
