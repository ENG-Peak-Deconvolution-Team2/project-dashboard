/*
 * ENG project dashboard — application logic (all UI strings English).
 *
 * This script owns only dynamic content inside the static containers shipped
 * by index.html. Panel shells, nav buttons, the planning-week filter and all
 * container elements are static; nothing here clones or moves them. Every
 * JSON value is rendered with document.createElement + textContent, and every
 * link is sanitized to http(s) or relative same-site paths before use.
 *
 * Public data schema (fetched from "data/project.json"):
 * {
 *   "project": {
 *     "name": string, "description": string,
 *     "updated": "YYYY-MM-DD",            // last content update (footer)
 *     "planVerified": "YYYY-MM-DD",
 *     "weeks": number,                    // planned weeks, e.g. 15
 *     "startDate": string|null, "repositoryUrl": string|null, "siteUrl": string|null
 *   },
 *   "teams": [{
 *     "id": "team2", "name": string, "approach": string,
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
const ROUTES = ["overview", "plan", "presentations", "results", "team"];
const ROUTE_ALIASES = {
  schedule: { route: "plan", section: "plan-schedule" },
  packages: { route: "plan", section: "plan-packages" },
  risks: { route: "plan", section: "plan-risks" },
  resources: { route: "results", section: "research-resources" },
  measurements: { route: "results", section: "research-resources", tab: "resources-tab-campaign" },
  journal: { route: "team", section: "team-journal" }
};
const WEEKS_FALLBACK = 15;
const DEFAULT_WEEK = 3;

let data = null;
let presentationWeeks = new Set();
let midtermWeeks = new Set();
const state = { week: DEFAULT_WEEK };

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
  return (data.teams || []).filter(t => t.id === "team2");
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
  const team = teamById("team2");
  return team && team.approach ? team.approach : null;
}

function weekModifiers(w) {
  const c = [];
  if (w === state.week) c.push("selected-week");
  if (presentationWeeks.has(w)) c.push("presentation-week");
  if (midtermWeeks.has(w)) c.push("midterm-week");
  return c;
}

/* ---------------- planning week ---------------- */

function wireControls() {
  const weekSel = byId("week-filter");
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
}

/* ---------------- renderers ---------------- */

function renderStats() {
  byId("schedule-count").textContent = `${totalWeeks()} weeks · ${tasksOf().length} tasks`;
  byId("package-count").textContent = `${(data.packages || []).length} packages`;
  byId("risk-count").textContent = `${(data.risks || []).length} potential risks`;
}

/* Latest supervisor-facing progress update: project.updates[] =
   { date, achievement, evidence: {label, href} | null, next, blocker | null }. */
function renderUpdate() {
  const box = byId("overview-update");
  if (!box) return;
  clear(box);
  const updates = (data.project.updates || [])
    .filter(u => u && u.achievement)
    .sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  const u = updates[0];
  const head = el("div", "update-head");
  head.appendChild(el("span", "section-eyebrow", "Latest update"));
  if (u && u.date) head.appendChild(el("time", "update-date", u.date));
  box.appendChild(head);
  box.classList.toggle("is-empty", !u);
  if (!u) {
    box.appendChild(el("p", "update-empty", "Progress update not yet recorded. Updates appear here with their date, evidence and next step."));
    return;
  }
  const grid = el("dl", "update-grid");
  grid.append(el("dt", null, "Achieved"), el("dd", null, u.achievement));
  if (u.next) grid.append(el("dt", null, "Next"), el("dd", null, u.next));
  if (u.blocker) grid.append(el("dt", null, "Needs attention"), el("dd", "update-blocker", u.blocker));
  box.appendChild(grid);
  const link = u.evidence && outputLink(u.evidence);
  if (link) { link.className = "update-evidence"; box.appendChild(link); }
}

function renderPackagesOverview() {
  const box = byId("overview-packages");
  if (!box) return;
  clear(box);
  const table = el("table", "programme-table");
  const columns = el("colgroup");
  for (const width of ["8%", "32%", ...Array(totalWeeks()).fill((60 / totalWeeks()) + "%")]) {
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
  const selected = table.querySelector("thead th:nth-child(" + (state.week + 1) + ")");
  const overflow = selected ? selected.offsetLeft + selected.offsetWidth - box.clientWidth : 0;
  box.scrollLeft = overflow > 0 ? overflow + 24 : 0;
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

function packageTags(ids) {
  const tags = el("div", "package-tags");
  for (const id of ids || []) {
    const pkg = data.packages.find(p => p.id === id);
    if (!pkg) continue;
    const a = anchor("#packages", id);
    a.className = "package-tag";
    a.dataset.go = "packages";
    a.dataset.wp = id;
    a.title = pkg.name;
    a.style.setProperty("--wp", pkg.color);
    tags.appendChild(a);
  }
  return tags;
}

function reviewLink(week, label) {
  const a = anchor("#presentations", label);
  a.dataset.go = "presentations";
  if (week) a.dataset.presentation = String(week);
  return a;
}

function renderPresentations() {
  const list = byId("presentation-list");
  const rail = byId("presentation-rail");
  const overview = byId("overview-presentation");
  const openWeeks = new Set([...list.querySelectorAll("details[open]")].map(d => d.dataset.reviewWeek));
  clear(list); clear(rail); clear(overview);
  const reviews = (data.presentations || []).filter(p => presentationWeeks.has(p.week)).sort((a, b) => a.week - b.week);
  const next = reviews.find(p => p.week >= state.week);
  overview.appendChild(el("span", "section-eyebrow", next?.week === state.week ? "Presentation in the selected week" : "Next planned presentation"));
  if (next) {
    overview.append(el("h2", "next-week", "Week " + next.week), el("h3", null, next.title));
    overview.appendChild(el("p", null, next.expectations[0]));
  } else {
    overview.append(el("h2", "next-week", "All six reviews"), el("p", null, "No further presentation is scheduled after the selected planning week. Review the briefing plans and remaining project tasks."));
  }
  const link = reviewLink(next?.week, next ? "View expectations ↗" : "View presentations ↗");
  link.className = "review-link";
  overview.appendChild(link);
  const keep = list.dataset.rendered === "1";
  for (const p of reviews) {
    const isNext = p === next;
    const stop = el("button", "presentation-stop" + (isNext ? " is-next" : ""));
    stop.type = "button";
    stop.dataset.go = "presentations";
    stop.dataset.presentation = String(p.week);
    stop.setAttribute("aria-label", "Open the week " + p.week + " presentation briefing");
    stop.append(el("small", null, "Week"), el("strong", null, String(p.week).padStart(2, "0")));
    rail.appendChild(stop);
    const card = el("details", "presentation-card" + (isNext ? " is-next" : ""));
    card.dataset.reviewWeek = String(p.week);
    card.open = isNext || (keep && openWeeks.has(String(p.week)));
    const top = el("summary", "presentation-top");
    const medallion = el("span", "week-medallion");
    medallion.append(el("small", null, "WEEK"), el("strong", null, String(p.week).padStart(2, "0")));
    const heading = el("span", "presentation-heading");
    const position = p.week === state.week ? "Selected planning week" : isNext ? "Next in the selected plan" : p.week < state.week ? "Earlier in the plan" : "Later in the plan";
    heading.append(el("span", "presentation-title", p.title), el("span", "review-position", position));
    top.append(medallion, heading);
    const body = el("div", "presentation-body");
    body.append(packageTags(p.packages), el("h4", "card-label", "Expected presentation content"));
    const items = el("ul", "expectation-list");
    for (const expectation of p.expectations || []) items.appendChild(el("li", null, expectation));
    body.appendChild(items);
    const evidence = el("div", "evidence-box");
    evidence.append(el("h4", "card-label", "Evidence to bring"), el("p", null, p.evidence));
    body.appendChild(evidence);
    const outputs = (p.outputs || []).map(outputLink).filter(Boolean);
    if (outputs.length) {
      const footer = el("div", "review-footer");
      footer.appendChild(el("span", null, "Presentation outputs"));
      for (const o of outputs) footer.appendChild(o);
      body.appendChild(footer);
    }
    card.append(top, body);
    list.appendChild(card);
  }
  list.dataset.rendered = "1";
}

function renderRisks() {
  const list = byId("risk-list");
  clear(list);
  for (const risk of data.risks || []) {
    const card = el("article", "risk-card");
    card.dataset.risk = risk.id;
    const top = el("div", "risk-card-header");
    top.append(el("span", "risk-id", risk.id), el("span", "risk-state", risk.status || "To review"));
    card.append(top, el("h3", null, risk.title), packageTags(risk.packages));
    const details = el("dl", "risk-details");
    details.append(el("dt", null, "Early warning"), el("dd", null, risk.trigger), el("dt", null, "Potential impact"), el("dd", null, risk.impact));
    const response = el("div", "risk-response");
    response.append(el("h4", null, "Proposed response"), el("p", null, risk.mitigation), el("h4", null, "Fallback plan"), el("p", null, risk.fallback));
    card.append(details, response, el("div", "risk-owner", "Suggested lead: " + risk.suggestedOwner));
    list.appendChild(card);
  }
}

function renderTeams() {
  const box = byId("overview-team");
  if (!box) return;
  clear(box);
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
      const avatar = el("span", "member-avatar", m.name.split(/\s+/).map(part => part[0]).slice(0, 2).join(""));
      avatar.setAttribute("aria-hidden", "true");
      const departments = { BME: "Biomedical Engineering", EEE: "Electrical & Electronics Engineering" };
      const department = m.department || "";
      const details = el("div", "member-details");
      details.append(name, el("span", "member-dept", departments[department] ? department + " · " + departments[department] : department));
      li.append(avatar, details);
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
  const table = el("table", "gantt-table");
  table.appendChild(el("caption", "gantt-caption", `Team 2 · Machine learning · Weeks 1–${total}`));
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

function outputLink(o) {
  let href = typeof o === "string" ? o : (o && (o.href || o.url));
  let label = typeof o === "string" ? "Output" : (o && (o.label || o.title)) || "Output";
  const safe = safeHref(href);
  return safe ? anchor(safe, label) : null;
}

/* Package progress from recorded task statuses; unknown ones stay visible as "not reported". */
function progressText(tasks, teams) {
  const statuses = tasks.flatMap(t => teams.map(team => statusFor(t, team.id)));
  const unknown = statuses.filter(st => st === "Not reported").length;
  if (!statuses.length || unknown === statuses.length) return "Progress not yet reported";
  const done = statuses.filter(st => st === "Complete").length;
  return unknown ? `${done} complete · ${unknown} not reported` : `${done}/${statuses.length} complete`;
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
    summary.appendChild(el("span", "package-status", progressText(pkg.tasks || [], teams)));
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
        if (status === "Not reported") continue;
        const badge = el("span", "task-status status-" + status.toLowerCase().replace(/\s+/g, "-"), status);
        badge.dataset.team = team.id;
        statuses.appendChild(badge);
      }
      if (statuses.childNodes.length) row.appendChild(statuses);
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
  const exps = (data.experiments || []).filter(x => x.team === "team2");
  if (!exps.length) {
    const empty = el("div", "empty-state");
    empty.appendChild(el("h3", null, "No results recorded yet"));
    const first = tasksOf().find(({ t }) => t.modelling);
    const note = el("p", "result-empty-note");
    if (first) {
      const link = anchor("#packages", first.t.id + " " + first.t.name.toLowerCase());
      link.dataset.go = "packages";
      link.dataset.wp = first.pkg.id;
      note.append("The first planned result is ", link, ", scheduled for " + formatWeeks(first.t.weeks).toLowerCase() + ". Each record will show its dataset, split, model and metrics.");
    } else {
      note.textContent = "Each record will show its dataset, split, model and metrics.";
    }
    empty.appendChild(note);
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
    if (x.figure) { const fig = el("div", "result-figure-box"); card.appendChild(fig); renderFigure(fig, x.figure); }
    const safe = safeHref(x.href);
    if (safe) card.appendChild(anchor(safe, "Open record"));
    box.appendChild(card);
  }
}

/* ---------------- Result figures (inline SVG, no library) ----------------
 * An experiment with "figure": "<path to JSON>" gets two charts built from that summary file:
 * voltammograms of one electrode across concentrations, and peak height against concentration.
 */
const SVGNS = "http://www.w3.org/2000/svg";
const SEQ = ["#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#104281"]; // 1 → 100 µM
const BLANK = "#8a90a3";
const CAT = { other: "#6551be", e1: "#d95f2b" };

function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function niceTicks(lo, hi, count) {
  const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / count)));
  const s = [1, 2, 2.5, 5, 10].map(m => m * step).find(m => (hi - lo) / m <= count) || step * 10;
  const out = [];
  for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function chartFrame(title, xLabel, yLabel, xDomain, yDomain) {
  const narrow = window.matchMedia("(max-width: 600px)").matches;
  const W = narrow ? 360 : 560, H = narrow ? 250 : 300, m = { l: 46, r: 12, t: 14, b: 42 };
  const x = v => m.l + (v - xDomain[0]) / (xDomain[1] - xDomain[0]) * (W - m.l - m.r);
  const y = v => H - m.b - (v - yDomain[0]) / (yDomain[1] - yDomain[0]) * (H - m.t - m.b);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img", "aria-label": title });
  const grid = svg("g", { class: "chart-grid" });
  for (const t of niceTicks(yDomain[0], yDomain[1], 5)) {
    grid.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
    const lab = svg("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }); lab.textContent = String(t); grid.appendChild(lab);
  }
  for (const t of niceTicks(xDomain[0], xDomain[1], 6)) {
    const lab = svg("text", { x: x(t), y: H - m.b + 18, "text-anchor": "middle" }); lab.textContent = String(t); grid.appendChild(lab);
  }
  grid.appendChild(svg("line", { class: "chart-axis", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
  const xl = svg("text", { class: "chart-axis-label", x: (m.l + W - m.r) / 2, y: H - 6, "text-anchor": "middle" }); xl.textContent = xLabel;
  const yl = svg("text", { class: "chart-axis-label", x: 14, y: (m.t + H - m.b) / 2, "text-anchor": "middle", transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})` }); yl.textContent = yLabel;
  grid.append(xl, yl);
  root.appendChild(grid);
  return { root, x, y, W, H, m };
}

function tooltipFor(wrap) {
  const tip = el("div", "chart-tip"); tip.hidden = true; wrap.appendChild(tip);
  return {
    show(lines, px, py) {
      clear(tip);
      for (const [i, line] of lines.entries()) tip.appendChild(el(i ? "span" : "strong", null, line));
      tip.hidden = false;
      const r = wrap.getBoundingClientRect();
      tip.style.left = Math.min(px + 14, r.width - tip.offsetWidth - 4) + "px";
      tip.style.top = Math.max(4, py - tip.offsetHeight - 10) + "px";
    },
    hide() { tip.hidden = true; }
  };
}

function legend(items) {
  const ul = el("ul", "chart-legend");
  for (const it of items) {
    const li = el("li");
    const sw = el("i", "chart-swatch" + (it.dashed ? " is-dashed" : "") + (it.dot ? " is-dot" : ""));
    sw.style.setProperty("--c", it.color);
    li.append(sw, el("span", null, it.label));
    ul.appendChild(li);
  }
  return ul;
}

function voltammogramChart(d) {
  const figure = el("figure", "result-figure");
  figure.appendChild(el("figcaption", null, "Voltammograms, electrode 3 (first repeat)"));
  const all = d.curves.flatMap(c => c.I);
  const f = chartFrame("Differential current against potential for each dopamine concentration, electrode 3", "Potential (V)", "δ current (µA)", [-0.1, 1.0], [0, Math.ceil(Math.max(...all) * 2) / 2]);
  const colour = c => c.c === 0 ? BLANK : SEQ[d.concentrations_uM.filter(v => v > 0).indexOf(c.c)] || SEQ[SEQ.length - 1];
  for (const c of d.curves) {
    const p = c.E.map((e, i) => `${i ? "L" : "M"}${f.x(e).toFixed(1)},${f.y(c.I[i]).toFixed(1)}`).join("");
    f.root.appendChild(svg("path", { d: p, class: "chart-line" + (c.c === 0 ? " is-dashed" : ""), stroke: colour(c) }));
  }
  const top = d.curves[d.curves.length - 1];
  const k = top.I.indexOf(Math.max(...top.I.filter((_, i) => top.E[i] < 0.4)));
  const lab = svg("text", { class: "chart-direct", x: f.x(top.E[k]) + 8, y: f.y(top.I[k]) + 4 }); lab.textContent = top.c + " µM";
  f.root.appendChild(lab);
  const guide = svg("line", { class: "chart-guide", y1: f.m.t, y2: f.H - f.m.b, visibility: "hidden" });
  f.root.appendChild(guide);
  const wrap = el("div", "chart-wrap"); wrap.appendChild(f.root);
  const tip = tooltipFor(wrap);
  const hit = svg("rect", { x: f.m.l, y: f.m.t, width: f.W - f.m.l - f.m.r, height: f.H - f.m.t - f.m.b, fill: "transparent" });
  f.root.appendChild(hit);
  hit.addEventListener("pointermove", ev => {
    const pt = f.root.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const loc = pt.matrixTransform(f.root.getScreenCTM().inverse());
    const E = top.E; let i = 0; for (let j = 1; j < E.length; j++) if (Math.abs(f.x(E[j]) - loc.x) < Math.abs(f.x(E[i]) - loc.x)) i = j;
    guide.setAttribute("x1", f.x(E[i])); guide.setAttribute("x2", f.x(E[i])); guide.setAttribute("visibility", "visible");
    const r = wrap.getBoundingClientRect();
    tip.show([`${E[i].toFixed(3)} V`, ...d.curves.slice().reverse().map(c => `${c.c ? c.c + " µM" : "Blank"}: ${(c.I[Math.min(i, c.I.length - 1)]).toFixed(2)} µA`)], ev.clientX - r.left, ev.clientY - r.top);
  });
  hit.addEventListener("pointerleave", () => { tip.hide(); guide.setAttribute("visibility", "hidden"); });
  figure.appendChild(wrap);
  figure.appendChild(legend(d.curves.map(c => ({ color: colour(c), label: c.c ? c.c + " µM" : "PBS blank", dashed: c.c === 0 }))));
  return figure;
}

function calibrationChart(d) {
  const figure = el("figure", "result-figure");
  figure.appendChild(el("figcaption", null, "Peak height against concentration, all 30 scans"));
  const maxH = Math.max(...d.scans.map(s => s.height));
  const f = chartFrame("Baseline-corrected peak height against dopamine concentration", "Dopamine (µM)", "Peak height (µA)", [0, 105], [0, Math.ceil(maxH * 2) / 2]);
  const fit = d.fit_all;
  f.root.appendChild(svg("line", { class: "chart-fit", x1: f.x(0), y1: f.y(Math.max(0, fit.intercept_uA)), x2: f.x(100), y2: f.y(fit.intercept_uA + fit.slope_nA_per_uM / 1000 * 100) }));
  const wrap = el("div", "chart-wrap"); wrap.appendChild(f.root);
  const tip = tooltipFor(wrap);
  for (const s of d.scans) {
    const g = svg("g", { class: "chart-point", tabindex: "0", role: "img", "aria-label": `${s.c} µM, electrode ${s.electrode}, repeat ${s.repeat}: ${s.height} µA` });
    const cx = f.x(s.c) + (s.electrode - 2.5) * 3, cy = f.y(Math.max(0, s.height));
    g.append(svg("circle", { cx, cy, r: 12, fill: "transparent" }), svg("circle", { cx, cy, r: 4.5, fill: s.electrode === 1 ? CAT.e1 : CAT.other, class: "chart-dot" }));
    const show = () => { const r = wrap.getBoundingClientRect(), b = g.getBoundingClientRect(); tip.show([`${s.c} µM · electrode ${s.electrode}, repeat ${s.repeat}`, `Peak ${s.height.toFixed(2)} µA at ${s.ep.toFixed(2)} V`], b.left - r.left + b.width / 2, b.top - r.top); };
    g.addEventListener("pointerenter", show); g.addEventListener("focus", show);
    g.addEventListener("pointerleave", () => tip.hide()); g.addEventListener("blur", () => tip.hide());
    f.root.appendChild(g);
  }
  figure.appendChild(wrap);
  figure.appendChild(legend([{ color: CAT.other, label: "Electrodes 2–4", dot: true }, { color: CAT.e1, label: "Electrode 1", dot: true }, { color: "#56617c", label: `Linear fit, all scans (R² ${fit.r2})`, dashed: true }]));
  return figure;
}

function scanTable(d) {
  const det = el("details", "result-table");
  det.appendChild(el("summary", null, "Table of all 30 scans"));
  const wrapT = el("div", "hours-scroll");
  const t = el("table", "hours-table");
  const hr = el("tr");
  for (const h of ["Dopamine (µM)", "Electrode", "Repeat", "Peak (V)", "Peak height (µA)"]) { const th = el("th", null, h); th.scope = "col"; hr.appendChild(th); }
  const th = el("thead"); th.appendChild(hr); t.appendChild(th);
  const tb = el("tbody");
  for (const s of d.scans) { const tr = el("tr"); for (const v of [s.c || "Blank", s.electrode, s.repeat, s.ep.toFixed(3), s.height.toFixed(3)]) tr.appendChild(el("td", null, v)); tb.appendChild(tr); }
  t.appendChild(tb); wrapT.appendChild(t); det.appendChild(wrapT);
  return det;
}

async function renderFigure(box, path) {
  const safe = safeHref(path);
  if (!safe) return;
  try {
    const res = await fetch(safe, { cache: "no-cache" });
    if (!res.ok) throw new Error();
    const d = await res.json();
    const grid = el("div", "result-figures");
    grid.append(voltammogramChart(d), calibrationChart(d));
    box.append(grid, el("p", "figure-note", d.method + " " + d.curves_note), scanTable(d));
  } catch {
    box.appendChild(el("p", "figure-note", "The figure data could not be loaded."));
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
    section.appendChild(el("h3", "resource-section-title", headings[type] || type));
    const grid = el("div", "resource-grid");
    for (const r of items) {
      const card = el("div", "resource-card");
      card.append(
        el("span", "resource-type", type),
        el("h4", "resource-title", r.title || "Untitled resource")
      );
      if (r.description) card.appendChild(el("p", "resource-description", r.description));
      const safe = safeHref(r.href);
      if (safe) card.appendChild(anchor(safe, r.label || "Open resource"));
      else card.appendChild(el("span", "resource-pending", r.pending || "Access pending"));
      grid.appendChild(card);
    }
    section.appendChild(grid);
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
  renderUpdate();
  renderPackagesOverview();
  renderFocus();
  renderPresentations();
  renderRisks();
  renderTeams();
  renderSchedule();
  renderPackages();
  renderResults();
  renderResources();
  renderJournal();
  renderTeam();
  renderWeekLabels();
  renderMeta();
}

/* ---------------- Team: hours, assignments and threads from GitHub Issues ----------------
 * Source: issues of the public dashboard repository, read without credentials when the Team
 * page is first shown. Issue forms (.github/ISSUE_TEMPLATE) write the bodies parsed here.
 * Only issues opened by the members' GitHub accounts count. Totals are shown only after a
 * complete read (a terminal page without rel="next"); a partial or failed read shows no numbers.
 */
const TEAM_PAGE_LIMIT = 5;
const TEAM_CACHE_MS = 10 * 60 * 1000;
const team = { status: "idle", items: [], fetchedAt: null, reset: null, inFlight: null, user: null, signInError: null, signInChecked: false };

function repoPath() {
  const m = String((data && data.project.repositoryUrl) || "").match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? m[1] + "/" + m[2] : null;
}

function teamMembers() {
  return ((teamById("team2") || {}).members || []).filter(m => m.github);
}

function memberByLogin(login) {
  const l = String(login || "").toLowerCase();
  return teamMembers().find(m => m.github.toLowerCase() === l) || null;
}

function firstName(member) { return member ? member.name.split(/\s+/)[0] : "Unknown"; }

const KINDS = ["hours", "task", "thread"];

function issueKind(issue) {
  const labels = issue.labels.map(l => l.toLowerCase());
  const labelled = KINDS.filter(kind => labels.includes("type:" + kind));
  if (labelled.length > 1) return "conflict";
  if (labelled.length === 1) return labelled[0];
  return KINDS.find(kind => issue.title.toLowerCase().startsWith("[" + kind + "]")) || null;
}

/* Issue-form bodies are "### Label\n\nvalue" sections; "_No response_" means empty. Fields are
   read in order up to the form's free-text field, which keeps everything after its heading, so a
   heading typed inside a note cannot overwrite an earlier field. Repeated fields are reported. */
const FREE_TEXT = { hours: "note", task: "what needs to be done", thread: "message" };

function formFields(body, kind) {
  const fields = {};
  const duplicates = [];
  const text = String(body || "").replace(/\r\n/g, "\n");
  const re = /^### +(.+)$/gm;
  const heads = [];
  for (let m; (m = re.exec(text));) heads.push({ key: m[1].trim().toLowerCase(), start: m.index, end: m.index + m[0].length });
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    const free = h.key === FREE_TEXT[kind];
    const stop = free || i + 1 === heads.length ? text.length : heads[i + 1].start;
    const value = text.slice(h.end, stop).trim();
    if (Object.hasOwn(fields, h.key)) { if (!duplicates.includes(h.key)) duplicates.push(h.key); }
    else fields[h.key] = value === "_No response_" ? "" : value;
    if (free) break;
  }
  return { fields, duplicates };
}

function packageOf(value) {
  const m = String(value || "").match(/^(WP\d+)\b/);
  return m && (data.packages || []).some(p => p.id === m[1]) ? m[1] : null;
}

function weekOf(value) {
  const m = String(value || "").match(/^Week (\d+)$/);
  const w = m ? Number(m[1]) : NaN;
  return w >= 1 && w <= totalWeeks() ? w : null;
}

function cleanTitle(title) { return String(title || "").replace(/^\[(hours|task|thread)\]\s*/i, "").trim() || "Untitled"; }

/* An hours entry belongs to the member named in its Member field; without one, to its author. */
function hoursOwner(f, author) {
  if (!f.member) return author;
  return teamMembers().find(m => m.name === f.member) || null;
}

function newestFirst(a, b) {
  return b.updated_at.localeCompare(a.updated_at) || b.number - a.number;
}

function analyseIssues(items) {
  const invalid = [], tasks = [], threads = [], weekly = new Map();
  let recognised = 0;
  for (const issue of items) {
    const kind = issueKind(issue);
    if (!kind) continue;
    recognised++;
    if (kind === "conflict") { invalid.push({ issue, reason: "has more than one type label" }); continue; }
    const author = memberByLogin(issue.login);
    if (!author) { invalid.push({ issue, reason: "opened by an account outside the team" }); continue; }
    const { fields: f, duplicates } = formFields(issue.body, kind);
    const twice = duplicates.length ? `repeated field${duplicates.length > 1 ? "s" : ""} ${duplicates.map(k => "“" + k.replace(/^wp(\d)/, "WP$1").replace(/^w/, "W") + "”").join(", ")}` : null;
    if (kind === "hours") {
      /* A readable week groups the entry even when another field is broken, so a broken
         correction still supersedes the older entry for that week. */
      const week = duplicates.includes("week") ? null : weekOf(f.week);
      if (!week) { invalid.push({ issue, reason: twice || "no valid week" }); continue; }
      const owner = hoursOwner(f, author);
      if (!owner) { invalid.push({ issue, reason: `“${f.member}” is not a team member` }); continue; }
      const key = owner.github + "|" + week;
      if (!weekly.has(key)) weekly.set(key, []);
      weekly.get(key).push({ issue, member: owner, week, f, error: twice });
      continue;
    }
    if (twice) { invalid.push({ issue, reason: twice }); continue; }
    if (kind === "task") {
      const target = teamMembers().find(m => m.name === f["assign to"]) || memberByLogin(issue.assignees[0]);
      tasks.push({ issue, from: author, to: target, pkg: packageOf(f["work package"]), due: weekOf(f["due week"]), task: f["related task"] });
    } else {
      threads.push({ issue, author, pkg: packageOf(f["work package"]) });
    }
  }
  /* One weekly entry per member: the most recently updated one counts, even when it is invalid. */
  const hours = [];
  for (const entries of weekly.values()) {
    entries.sort((a, b) => newestFirst(a.issue, b.issue));
    const [latest, ...older] = entries;
    for (const o of older) invalid.push({ issue: o.issue, reason: `superseded by the newer week ${latest.week} entry #${latest.issue.number}` });
    const byPackage = {}; let problem = latest.error || null;
    for (const pkg of problem ? [] : data.packages || []) {
      const raw = (latest.f[pkg.id.toLowerCase() + " hours"] || "").replace(",", ".");
      if (!raw) continue;
      const h = Number(raw);
      if (!Number.isFinite(h) || h < 0 || h > 60) { problem = pkg.id + " hours must be a number from 0 to 60"; break; }
      if (h) byPackage[pkg.id] = h;
    }
    if (problem) invalid.push({ issue: latest.issue, reason: problem + `; week ${latest.week} is not counted until it is corrected` });
    else hours.push({ issue: latest.issue, member: latest.member, week: latest.week, byPackage });
  }
  return { recognised, hours, invalid, tasks, threads };
}

function reduceIssue(i) {
  return { number: i.number, title: i.title || "", state: i.state, body: i.body || "", comments: i.comments || 0,
    login: i.user && i.user.login, assignees: (i.assignees || []).map(a => a.login),
    labels: (i.labels || []).map(l => typeof l === "string" ? l : l.name || ""),
    updated_at: i.updated_at || "", created_at: i.created_at || "", html_url: i.html_url };
}

function readTeamCache(repo) {
  try {
    const c = JSON.parse(sessionStorage.getItem("eng-team:" + repo) || "null");
    return c && Date.now() - c.at < TEAM_CACHE_MS ? c : null;
  } catch { return null; }
}

function writeTeamCache(repo, items) {
  try { sessionStorage.setItem("eng-team:" + repo, JSON.stringify({ at: Date.now(), items })); } catch { /* optional */ }
}

async function loadTeam(force) {
  const repo = repoPath();
  if (!repo) { team.status = "failed"; renderTeam(); return; }
  if (team.inFlight) return team.inFlight;
  const cached = !force && readTeamCache(repo);
  if (cached) {
    Object.assign(team, { status: "ok", items: cached.items, fetchedAt: new Date(cached.at) });
    renderTeam();
    return;
  }
  team.status = "loading"; renderTeam();
  team.inFlight = (async () => {
    const items = [];
    let url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=100`;
    try {
      for (let page = 1; url; page++) {
        if (page > TEAM_PAGE_LIMIT) { team.status = "incomplete"; return; }
        const res = await fetch(url, { headers: apiHeaders(false) });
        if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
          const reset = Number(res.headers.get("x-ratelimit-reset"));
          Object.assign(team, { status: "limited", reset: reset ? new Date(reset * 1000) : null });
          return;
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        const batch = await res.json();
        if (!Array.isArray(batch)) throw new Error("Unexpected response");
        for (const i of batch) if (!i.pull_request) items.push(reduceIssue(i));
        const next = (res.headers.get("link") || "").match(/<([^>]+)>;\s*rel="next"/);
        url = next ? next[1] : null;
      }
      Object.assign(team, { status: "ok", items, fetchedAt: new Date() });
      writeTeamCache(repo, items);
    } catch {
      team.status = "failed";
    }
  })();
  try { await team.inFlight; } finally { team.inFlight = null; renderTeam(); }
}

function issueLink(issue, label) {
  const text = label || "#" + issue.number;
  const href = safeHref(issue.html_url);
  if (!href) return el("span", "issue-link", text);
  const a = anchor(href, text);
  a.className = "issue-link";
  return a;
}

function issueButton(issue) {
  const b = el("button", "issue-link", cleanTitle(issue.title));
  b.type = "button";
  b.addEventListener("click", () => openThread(issue));
  return b;
}

function newIssueUrl(template) {
  const repo = repoPath();
  return repo ? `https://github.com/${repo}/issues/new?template=${template}` : null;
}

function renderTeamActions() {
  const box = byId("team-actions");
  if (!box) return;
  clear(box);
  for (const [label, open] of [["Log weekly hours", openHoursForm], ["Assign work", openTaskForm], ["Start a thread", openThreadForm]]) {
    const b = el("button", "team-action", label);
    b.type = "button";
    b.addEventListener("click", open);
    box.appendChild(b);
  }
  const note = el("p", "team-public-note");
  if (team.user) {
    note.append("Signed in as " + team.user.member.name + ". Entries are saved as public issues in the project repository. ");
    const out = el("button", "link-button", "Disconnect");
    out.type = "button"; out.addEventListener("click", disconnect);
    note.appendChild(out);
  } else {
    note.append("Entries are saved as public issues in the project repository. ");
    const c = el("button", "link-button", "Connect GitHub");
    c.type = "button"; c.addEventListener("click", () => openConnect());
    note.append(c, " once to write from here.");
  }
  box.appendChild(note);
}

function renderTeamStatus(analysis) {
  const box = byId("team-status");
  clear(box);
  const repo = repoPath();
  const issues = repo ? anchor(`https://github.com/${repo}/issues`, "open the issues on GitHub") : null;
  const say = (cls, text, withLink) => {
    const p = el("p", "team-notice " + cls, text);
    if (withLink && issues) p.append(" You can ", issues, " directly.");
    box.appendChild(p);
  };
  if (team.status === "loading" || team.status === "idle") say("is-loading", "Reading team records from GitHub…");
  else if (team.status === "failed") say("is-problem", "Team records could not be read from GitHub, so no hours or assignments are shown.", true);
  else if (team.status === "limited") say("is-problem", "GitHub’s request limit for this network has been reached" + (team.reset ? `; it resets at ${team.reset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : ".") + " No figures are shown until the records can be read in full.", true);
  else if (team.status === "incomplete") say("is-problem", `There are more team records than this page reads (${TEAM_PAGE_LIMIT * 100}), so totals are not shown.`, true);
  else if (!analysis.recognised) {
    const empty = el("div", "empty-state team-empty");
    empty.append(el("h3", null, "No team records yet"),
      el("p", null, "Weekly hours, assigned work and discussion threads appear here as soon as the first entry is made with the buttons above."));
    box.appendChild(empty);
  }
  const meta = byId("team-meta");
  clear(meta);
  if (team.fetchedAt && team.status === "ok") {
    const time = team.fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const today = team.fetchedAt.toDateString() === new Date().toDateString();
    meta.appendChild(el("span", null, "Read from GitHub " + (today ? "at " + time : "on " + team.fetchedAt.toISOString().slice(0, 10) + " " + time)));
  }
  const refresh = el("button", "team-refresh", "Refresh");
  refresh.type = "button";
  refresh.disabled = team.status === "loading";
  refresh.addEventListener("click", () => loadTeam(true));
  meta.appendChild(refresh);
}

function formatHours(h) { return (Math.round(h * 10) / 10).toLocaleString("en-GB"); }

function renderTeamHours(analysis) {
  const box = byId("team-hours");
  clear(box);
  box.hidden = !analysis.hours.length && !analysis.invalid.length;
  if (box.hidden) return;
  const heading = el("div", "section-heading");
  const title = el("div");
  title.append(el("span", "section-eyebrow", "Logged time by work package"), el("h2", null, "Hours"));
  heading.appendChild(title);
  box.appendChild(heading);
  if (!analysis.hours.length) {
    box.appendChild(el("p", "team-quiet", "No valid hours entries to total yet."));
    renderNotCounted(box, analysis);
    return;
  }
  const pkgs = data.packages || [];
  const rows = teamMembers().map(m => {
    const own = analysis.hours.filter(h => h.member === m);
    const by = Object.fromEntries(pkgs.map(p => [p.id, own.reduce((s, h) => s + (h.byPackage[p.id] || 0), 0)]));
    return { label: m.name, by, total: Object.values(by).reduce((a, b) => a + b, 0), weeks: new Set(own.map(h => h.week)).size };
  });
  const teamBy = Object.fromEntries(pkgs.map(p => [p.id, rows.reduce((s, r) => s + r.by[p.id], 0)]));
  const teamTotal = rows.reduce((s, r) => s + r.total, 0);
  const summary = el("ul", "hours-summary");
  for (const r of rows.concat([{ label: "Team", total: teamTotal }])) {
    const li = el("li", r.label === "Team" ? "is-team" : null);
    li.append(el("strong", null, formatHours(r.total) + " h"), el("span", null, r.label === "Team" ? "Team total" : r.label));
    summary.appendChild(li);
  }
  box.appendChild(summary);
  const wrap = el("div", "hours-scroll");
  wrap.tabIndex = 0; wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", "Logged hours by member and work package");
  const table = el("table", "hours-table");
  table.appendChild(el("caption", "visually-hidden", "Logged hours by member and work package"));
  const hr = el("tr");
  const corner = el("th", null, "Member"); corner.scope = "col"; hr.appendChild(corner);
  for (const p of pkgs) {
    const th = el("th", "hours-wp", p.id); th.scope = "col"; th.title = p.name; th.style.setProperty("--wp", p.color); hr.appendChild(th);
  }
  for (const label of ["Total", "Weeks logged"]) { const th = el("th", null, label); th.scope = "col"; hr.appendChild(th); }
  const thead = el("thead"); thead.appendChild(hr); table.appendChild(thead);
  const tbody = el("tbody");
  const addRow = (r, cls) => {
    const tr = el("tr", cls);
    const th = el("th", null, r.label); th.scope = "row"; tr.appendChild(th);
    for (const p of pkgs) tr.appendChild(el("td", r.by[p.id] ? "hours-value" : "hours-value is-zero", formatHours(r.by[p.id])));
    const total = el("td", "hours-total");
    const share = teamTotal ? r.total / teamTotal : 0;
    total.append(el("span", null, formatHours(r.total)));
    if (cls !== "hours-team") { const bar = el("i", "hours-bar"); bar.style.setProperty("--share", String(share)); bar.setAttribute("aria-hidden", "true"); total.appendChild(bar); }
    tr.append(total, el("td", "hours-weeks", r.weeks === null ? "" : `${r.weeks} / ${totalWeeks()}`));
    tbody.appendChild(tr);
  };
  rows.forEach(r => addRow(r));
  addRow({ label: "Team", by: teamBy, total: teamTotal, weeks: new Set(analysis.hours.map(h => h.week)).size }, "hours-team");
  table.appendChild(tbody);
  wrap.appendChild(table);
  box.appendChild(wrap);
  box.appendChild(weeklyHoursTable(analysis));
  box.appendChild(el("p", "figure-note", `Hours are logged time from ${analysis.hours.length} weekly ${analysis.hours.length === 1 ? "entry" : "entries"}, not a measure of all time worked. Team weeks counts weeks with at least one entry.`));
  renderNotCounted(box, analysis);
}

/* Hours per week and member, weeks 1 up to the later of the selected week and the last logged week.
   Clicking a cell opens that member's week in the form. */
function weeklyHoursTable(analysis) {
  const sec = el("div", "weekly-hours");
  sec.appendChild(el("h3", "weekly-hours-title", "By week"));
  const members = teamMembers();
  const last = Math.max(state.week, ...analysis.hours.map(h => h.week));
  const wrap = el("div", "hours-scroll");
  const table = el("table", "hours-table weekly-table");
  table.appendChild(el("caption", "visually-hidden", "Logged hours by week and member"));
  const hr = el("tr");
  for (const h of ["Week", ...members.map(m => m.name), "Team"]) { const th = el("th", null, h); th.scope = "col"; hr.appendChild(th); }
  const thead = el("thead"); thead.appendChild(hr); table.appendChild(thead);
  const tbody = el("tbody");
  for (let w = 1; w <= last; w++) {
    const tr = el("tr", w === state.week ? "is-selected-week" : null);
    const th = el("th", null, "Week " + w + (midtermWeeks.has(w) ? " · midterm" : "")); th.scope = "row"; tr.appendChild(th);
    let sum = 0, any = false;
    for (const m of members) {
      const e = analysis.hours.find(h => h.member === m && h.week === w);
      const total = e ? Object.values(e.byPackage).reduce((a, b) => a + b, 0) : null;
      if (e) { sum += total; any = true; }
      const td = el("td", e ? "hours-value" : "hours-value is-zero");
      const b = el("button", "week-cell", e ? formatHours(total) : "—");
      b.type = "button";
      b.setAttribute("aria-label", `${m.name}, week ${w}: ${e ? formatHours(total) + " hours. Edit" : "not logged. Log hours"}`);
      b.addEventListener("click", () => openHoursForm({ member: m, week: w }));
      td.appendChild(b);
      tr.appendChild(td);
    }
    tr.appendChild(el("td", "hours-total", any ? formatHours(sum) : "—"));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  sec.appendChild(wrap);
  sec.appendChild(el("p", "dialog-hint", "Select a cell to log or edit that member’s week."));
  return sec;
}

function renderNotCounted(box, analysis) {
  if (!analysis.invalid.length) return;
  const d = el("details", "not-counted");
  d.appendChild(el("summary", null, `${analysis.invalid.length} ${analysis.invalid.length === 1 ? "entry is" : "entries are"} not counted`));
  const ul = el("ul");
  for (const x of analysis.invalid.slice().sort((a, b) => a.issue.number - b.issue.number)) {
    const li = el("li"); li.append(issueLink(x.issue), " " + cleanTitle(x.issue.title) + ": " + x.reason); ul.appendChild(li);
  }
  d.appendChild(ul);
  box.appendChild(d);
}

function renderTeamTasks(analysis) {
  const box = byId("team-assignments");
  clear(box);
  box.hidden = !analysis.tasks.length;
  if (box.hidden) return;
  const open = analysis.tasks.filter(t => t.issue.state === "open");
  const closed = analysis.tasks.length - open.length;
  const heading = el("div", "section-heading");
  const title = el("div");
  title.append(el("span", "section-eyebrow", `${open.length} open · ${closed} closed`), el("h2", null, "Assigned work"));
  heading.appendChild(title);
  box.appendChild(heading);
  if (!open.length) box.appendChild(el("p", "team-quiet", "No open assignments."));
  const ul = el("ul", "team-list");
  for (const t of open.slice(0, 6)) {
    const li = el("li", "team-item");
    const pkg = (data.packages || []).find(p => p.id === t.pkg);
    if (pkg) li.style.setProperty("--wp", pkg.color);
    li.appendChild(issueButton(t.issue));
    const meta = [`${firstName(t.from)} → ${t.to ? firstName(t.to) : "unassigned"}`, t.task || t.pkg || "General", t.due ? "due week " + t.due : null].filter(Boolean).join(" · ");
    li.appendChild(el("span", "team-item-meta", meta));
    ul.appendChild(li);
  }
  box.appendChild(ul);
  const repo = repoPath();
  if (repo && analysis.tasks.length > 6) box.appendChild(anchor(`https://github.com/${repo}/issues?q=label%3Atype%3Atask`, "All assignments on GitHub ↗"));
}

function renderTeamThreads(analysis) {
  const box = byId("team-threads");
  clear(box);
  box.hidden = !analysis.threads.length;
  if (box.hidden) return;
  const heading = el("div", "section-heading");
  const title = el("div");
  title.append(el("span", "section-eyebrow", "Most recent first"), el("h2", null, "Threads"));
  heading.appendChild(title);
  box.appendChild(heading);
  const ul = el("ul", "team-list");
  const recent = analysis.threads.slice().sort((a, b) => b.issue.updated_at.localeCompare(a.issue.updated_at));
  for (const t of recent.slice(0, 5)) {
    const li = el("li", "team-item" + (t.issue.state === "closed" ? " is-closed" : ""));
    const pkg = (data.packages || []).find(p => p.id === t.pkg);
    if (pkg) li.style.setProperty("--wp", pkg.color);
    li.appendChild(issueButton(t.issue));
    const replies = t.issue.comments === 1 ? "1 reply" : t.issue.comments + " replies";
    li.appendChild(el("span", "team-item-meta", [firstName(t.author), t.pkg || "General", replies, "updated " + t.issue.updated_at.slice(0, 10), t.issue.state === "closed" ? "closed" : null].filter(Boolean).join(" · ")));
    ul.appendChild(li);
  }
  box.appendChild(ul);
  const repo = repoPath();
  if (repo && analysis.threads.length > 5) box.appendChild(anchor(`https://github.com/${repo}/issues?q=label%3Atype%3Athread`, "All threads on GitHub ↗"));
}

function renderTeam() {
  if (!data || !byId("team-status")) return;
  renderTeamActions();
  const analysis = team.status === "ok" ? analyseIssues(team.items) : { recognised: 0, hours: [], invalid: [], tasks: [], threads: [] };
  renderTeamStatus(analysis);
  renderTeamHours(analysis);
  renderTeamTasks(analysis);
  renderTeamThreads(analysis);
}

/* ---------------- Team: writing from the dashboard ----------------
 * Members connect once with their own GitHub token (classic, public_repo scope). The token is
 * kept in this browser's localStorage only and sent only to api.github.com. Entries are written
 * as issues in the same issue-form format the parser above reads, so GitHub stays the store.
 */
const TOKEN_KEY = "eng-team-token";

function readToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } }
function saveToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } }

function apiHeaders(json) {
  const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const t = readToken();
  if (t) h.Authorization = "Bearer " + t;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function gh(path, method = "GET", body) {
  const res = await fetch("https://api.github.com" + path, { method, headers: apiHeaders(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json()).message || ""; } catch { /* no body */ }
    const err = new Error(msg || "GitHub returned " + res.status);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function checkSignIn() {
  if (!readToken()) { team.user = null; return; }
  try {
    const u = await gh("/user");
    team.user = memberByLogin(u.login) ? { login: u.login, member: memberByLogin(u.login) } : null;
    if (!team.user) { saveToken(""); team.signInError = `The account ${u.login} is not a member of Team 2.`; }
  } catch (e) {
    team.user = null;
    if (e.status === 401) { saveToken(""); team.signInError = "GitHub rejected this token (wrong, expired or revoked). Create a new one and connect again."; }
  }
}

function upsertIssue(raw) {
  const r = reduceIssue(raw);
  const i = team.items.findIndex(x => x.number === r.number);
  if (i >= 0) team.items[i] = r; else team.items.unshift(r);
  const repo = repoPath();
  if (repo && team.status === "ok") writeTeamCache(repo, team.items);
  renderTeam();
}

/* ---- form bodies (same layout GitHub issue forms produce) ---- */
const NO_RESPONSE = "_No response_";
function section(label, value) { return `### ${label}\n\n${String(value || "").trim() || NO_RESPONSE}`; }
function packageLabel(id) { const p = (data.packages || []).find(x => x.id === id); return p ? `${p.id} · ${p.name}` : "General"; }

function hoursIssue(week, member, values, note) {
  const parts = [section("Week", "Week " + week), section("Member", member.name)];
  for (const p of data.packages || []) parts.push(section(p.id + " hours", values[p.id]));
  parts.push(section("Note", note));
  return { title: `[Hours] Week ${week} · ${firstName(member)}`, body: parts.join("\n\n") };
}

/* ---- dialog helpers ---- */
function dialogBox() { return byId("team-dialog"); }

function openDialog(title, build) {
  const d = dialogBox();
  const form = byId("team-form");
  clear(form);
  const head = el("div", "dialog-head");
  const h = el("h2", null, title); h.id = "team-dialog-title"; head.appendChild(h);
  const x = el("button", "dialog-close", "×");
  x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", () => d.close());
  head.appendChild(x);
  form.appendChild(head);
  const body = el("div", "dialog-body");
  form.appendChild(body);
  build(body, form);
  if (!d.open) d.showModal();
  const first = form.querySelector("input, select, textarea, button.primary");
  if (first) first.focus();
}

function field(label, control, hint) {
  const wrap = el("label", "dialog-field");
  wrap.appendChild(el("span", "dialog-label", label));
  wrap.appendChild(control);
  if (hint) wrap.appendChild(el("span", "dialog-hint", hint));
  return wrap;
}

function input(type, attrs = {}) {
  const i = el(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") i.type = type;
  for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
  return i;
}

function select(options, value) {
  const s = el("select", "form-select");
  for (const [v, label] of options) s.appendChild(option(v, label));
  if (value !== undefined) s.value = String(value);
  return s;
}

function weekOptions() { return Array.from({ length: totalWeeks() }, (_, i) => [String(i + 1), "Week " + (i + 1)]); }
function packageOptions() { return (data.packages || []).map(p => [p.id, `${p.id} · ${p.name}`]).concat([["General", "General"]]); }

function actionsRow(form, label, onSubmit) {
  const row = el("div", "dialog-actions");
  const status = el("p", "dialog-status"); status.setAttribute("role", "status");
  const cancel = el("button", "btn-quiet", "Cancel"); cancel.type = "button"; cancel.addEventListener("click", () => dialogBox().close());
  const ok = el("button", "primary", label); ok.type = "submit";
  row.append(status, cancel, ok);
  form.appendChild(row);
  form.onsubmit = async (e) => {
    e.preventDefault();
    ok.disabled = true; status.textContent = "Saving to GitHub…"; status.classList.remove("is-error");
    try { await onSubmit(); dialogBox().close(); }
    catch (err) { status.textContent = "Not saved: " + err.message; status.classList.add("is-error"); }
    finally { ok.disabled = false; }
  };
}

function requireSignIn(then) {
  if (team.user) return then();
  openConnect(then);
}

/* ---- connect ---- */
function openConnect(then) {
  openDialog("Connect your GitHub account", (body, form) => {
    body.appendChild(el("p", null, "Saving from the dashboard needs a GitHub token of your own. You create it once; it stays in this browser only and is sent only to GitHub."));
    const steps = el("ol", "dialog-steps");
    const li1 = el("li");
    const link = anchor("https://github.com/settings/tokens/new?description=Peak%20Deconvolution%20dashboard&scopes=public_repo", "Open GitHub’s token page ↗");
    li1.append(link, " (the name and the ", el("code", null, "public_repo"), " permission are already filled in).");
    steps.append(li1, el("li", null, "Choose an expiry, for example 90 days, then press Generate token."), el("li", null, "Copy the token and paste it below."));
    body.appendChild(steps);
    const t = input("password", { autocomplete: "off", spellcheck: "false", placeholder: "ghp_…", required: "" });
    body.appendChild(field("Token", t));
    if (team.signInError) body.appendChild(el("p", "dialog-status is-error", team.signInError));
    actionsRow(form, "Connect", async () => {
      saveToken(t.value.trim());
      team.signInError = null;
      await checkSignIn();
      if (!team.user) throw new Error(team.signInError || "GitHub did not accept this token.");
      renderTeam();
      if (then) setTimeout(then, 0);
    });
  });
}

function disconnect() {
  saveToken(""); team.user = null; renderTeam();
}

/* ---- weekly hours ---- */
function entryFor(member, week) {
  if (team.status !== "ok") return null;
  const found = team.items.filter(i => {
    if (issueKind(i) !== "hours" || !memberByLogin(i.login)) return false;
    const f = formFields(i.body, "hours").fields;
    return weekOf(f.week) === week && hoursOwner(f, memberByLogin(i.login)) === member;
  });
  return found.sort(newestFirst)[0] || null;
}

function openHoursForm(preset = {}) {
  requireSignIn(() => openDialog("Log weekly hours", (body, form) => {
    const row = el("div", "dialog-row");
    const who = select(teamMembers().map(m => [m.github, m.name + (m === team.user.member ? " (me)" : "")]), (preset.member || team.user.member).github);
    const week = select(weekOptions(), preset.week || state.week);
    row.append(field("Member", who), field("Week", week));
    body.appendChild(row);
    const grid = el("div", "hours-inputs");
    const boxes = {};
    for (const p of data.packages || []) {
      const i = input("number", { min: "0", max: "60", step: "0.5", inputmode: "decimal", placeholder: "0" });
      boxes[p.id] = i;
      const f = field(p.id, i); f.title = p.name; f.style.setProperty("--wp", p.color);
      grid.appendChild(f);
    }
    body.appendChild(grid);
    const note = input("textarea", { rows: "3", placeholder: "What the time was spent on (optional)" });
    body.appendChild(field("Note", note));
    const info = el("p", "dialog-hint");
    body.appendChild(info);
    const fill = () => {
      const existing = entryFor(memberByLogin(who.value), Number(week.value));
      const f = existing ? formFields(existing.body, "hours").fields : {};
      for (const p of data.packages || []) boxes[p.id].value = f[p.id.toLowerCase() + " hours"] || "";
      note.value = f.note || "";
      info.textContent = existing ? `Week ${week.value} is already logged for ${firstName(memberByLogin(who.value))}; saving updates that entry (#${existing.number}).` : "Leave a package empty for 0 hours. Entries are public in the project repository.";
    };
    week.addEventListener("change", fill);
    who.addEventListener("change", fill);
    fill();
    actionsRow(form, "Save hours", async () => {
      const values = {};
      for (const [id, box] of Object.entries(boxes)) {
        const v = box.value.trim();
        if (v && !(Number(v) >= 0 && Number(v) <= 60)) throw new Error(id + " hours must be between 0 and 60.");
        values[id] = v;
      }
      const w = Number(week.value), member = memberByLogin(who.value);
      const { title, body: text } = hoursIssue(w, member, values, note.value);
      const existing = entryFor(member, w);
      const repo = repoPath();
      const saved = existing
        ? await gh(`/repos/${repo}/issues/${existing.number}`, "PATCH", { title, body: text })
        : await gh(`/repos/${repo}/issues`, "POST", { title, body: text, labels: ["type:hours"] });
      upsertIssue(saved);
    });
  }));
}

/* ---- assign work ---- */
function openTaskForm() {
  requireSignIn(() => openDialog("Assign work", (body, form) => {
    const others = teamMembers().filter(m => m !== team.user.member).concat([team.user.member]);
    const who = select(others.map(m => [m.github, m.name + (m === team.user.member ? " (me)" : "")]));
    body.appendChild(field("Assign to", who));
    const title = input("text", { required: "", maxlength: "120", placeholder: "Short description of the work" });
    body.appendChild(field("Title", title));
    const row = el("div", "dialog-row");
    const pkg = select(packageOptions(), "General");
    const due = select([["", "No due week"]].concat(weekOptions()), "");
    row.append(field("Work package", pkg), field("Due week", due));
    body.appendChild(row);
    const task = select([["", "No specific task"]]);
    const syncTasks = () => {
      clear(task); task.appendChild(option("", "No specific task"));
      const p = (data.packages || []).find(x => x.id === pkg.value);
      for (const t of (p && p.tasks) || []) task.appendChild(option(t.id, `${t.id} ${t.name}`));
    };
    pkg.addEventListener("change", syncTasks); syncTasks();
    body.appendChild(field("Related task", task));
    const details = input("textarea", { rows: "4", required: "", placeholder: "What needs to be done" });
    body.appendChild(field("Details", details));
    actionsRow(form, "Assign", async () => {
      const target = memberByLogin(who.value);
      const text = [section("Assign to", target.name), section("Work package", packageLabel(pkg.value)), section("Related task", task.value),
        section("Due week", due.value ? "Week " + due.value : "No due week"), section("What needs to be done", details.value)].join("\n\n");
      const saved = await gh(`/repos/${repoPath()}/issues`, "POST", { title: "[Task] " + title.value.trim(), body: text, labels: ["type:task"], assignees: [target.github] });
      upsertIssue(saved);
    });
  }));
}

async function setIssueState(issue, stateValue) {
  const saved = await gh(`/repos/${repoPath()}/issues/${issue.number}`, "PATCH", { state: stateValue });
  upsertIssue(saved);
}

/* ---- threads ---- */
function openThreadForm() {
  requireSignIn(() => openDialog("Start a thread", (body, form) => {
    const title = input("text", { required: "", maxlength: "120", placeholder: "Topic" });
    body.appendChild(field("Topic", title));
    const pkg = select(packageOptions(), "General");
    body.appendChild(field("Work package", pkg));
    const msg = input("textarea", { rows: "5", required: "", placeholder: "Message" });
    body.appendChild(field("Message", msg));
    body.appendChild(el("p", "dialog-hint", "Messages are public in the project repository. GitHub e-mails the other member when a thread gets a new message."));
    actionsRow(form, "Start thread", async () => {
      const text = [section("Work package", packageLabel(pkg.value)), section("Message", msg.value)].join("\n\n");
      const saved = await gh(`/repos/${repoPath()}/issues`, "POST", { title: "[Thread] " + title.value.trim(), body: text, labels: ["type:thread"] });
      upsertIssue(saved);
    });
  }));
}

function message(author, date, text) {
  const m = el("article", "thread-message");
  const head = el("div", "thread-message-head");
  const who = memberByLogin(author);
  head.append(el("strong", null, who ? who.name : author), el("time", null, String(date || "").slice(0, 16).replace("T", " ")));
  m.append(head, el("p", null, text));
  return m;
}

/* Threads and assignments open in the same view: first message, replies, reply box, close/reopen. */
function openThread(issue) {
  const kind = issueKind(issue) === "task" ? "task" : "thread";
  openDialog(cleanTitle(issue.title), (body, form) => {
    const f = formFields(issue.body, kind).fields;
    const pkg = packageOf(f["work package"]);
    const meta = kind === "task"
      ? [`${firstName(memberByLogin(issue.login))} → ${f["assign to"] ? f["assign to"].split(/\s+/)[0] : "unassigned"}`, f["related task"] || pkg || "General", weekOf(f["due week"]) ? "due week " + weekOf(f["due week"]) : null]
      : [pkg || "General"];
    meta.push(issue.state === "closed" ? "closed" : "open");
    body.appendChild(el("p", "dialog-hint", meta.filter(Boolean).join(" · ")));
    const list = el("div", "thread-messages");
    list.appendChild(message(issue.login, issue.created_at || issue.updated_at, (kind === "task" ? f["what needs to be done"] : f.message) || ""));
    const loading = el("p", "dialog-hint", "Loading replies…");
    list.appendChild(loading);
    body.appendChild(list);
    gh(`/repos/${repoPath()}/issues/${issue.number}/comments?per_page=100`).then(comments => {
      loading.remove();
      for (const c of comments) list.appendChild(message(c.user && c.user.login, c.created_at, c.body || ""));
    }).catch(() => { loading.textContent = "Replies could not be loaded."; });
    const reply = input("textarea", { rows: "3", placeholder: team.user ? "Write a reply" : "Connect GitHub to reply" });
    if (!team.user) reply.disabled = true;
    body.appendChild(field("Reply", reply));
    const gh1 = safeHref(issue.html_url);
    if (gh1) { const a = anchor(gh1, "Open on GitHub ↗"); a.className = "dialog-link"; body.appendChild(a); }
    if (!team.user) {
      const row = el("div", "dialog-actions");
      const c = el("button", "primary", "Connect GitHub"); c.type = "button"; c.addEventListener("click", () => openConnect(() => openThread(issue)));
      row.appendChild(c); form.appendChild(row);
      return;
    }
    const toggle = el("button", "btn-quiet", issue.state === "open" ? (kind === "task" ? "Mark as closed" : "Close thread") : "Reopen");
    toggle.type = "button";
    toggle.addEventListener("click", async () => { toggle.disabled = true; try { await setIssueState(issue, issue.state === "open" ? "closed" : "open"); dialogBox().close(); } catch (e) { toggle.disabled = false; toggle.textContent = "Failed: " + e.message; } });
    actionsRow(form, "Send reply", async () => {
      if (!reply.value.trim()) throw new Error("The reply is empty.");
      const c = await gh(`/repos/${repoPath()}/issues/${issue.number}/comments`, "POST", { body: reply.value.trim() });
      upsertIssue(Object.assign({}, issueRaw(issue), { comments: issue.comments + 1, updated_at: c.created_at || new Date().toISOString() }));
    });
    form.querySelector(".dialog-actions").insertBefore(toggle, form.querySelector(".dialog-actions .btn-quiet"));
  });
}

/* reduceIssue() expects the API shape; rebuild it from a reduced record. */
function issueRaw(r) {
  return { number: r.number, title: r.title, state: r.state, body: r.body, comments: r.comments, user: { login: r.login },
    assignees: r.assignees.map(login => ({ login })), labels: r.labels.map(name => ({ name })), updated_at: r.updated_at, created_at: r.created_at, html_url: r.html_url };
}

/* ---------------- hash / Bootstrap tab navigation ---------------- */

function navButtons() {
  return Array.from(document.querySelectorAll('[data-bs-toggle="tab"][data-route]'));
}

function activeRoute() {
  const b = navButtons().find((n) => n.classList.contains("active"));
  return b ? b.dataset.route : "overview";
}

function resolveRoute(value) {
  if (ROUTES.includes(value)) return { route: value };
  return Object.hasOwn(ROUTE_ALIASES, value) ? ROUTE_ALIASES[value] : { route: "overview" };
}

function openSection(id, focus = true) {
  const section = byId(id);
  if (!section) return;
  if (section.tagName === "DETAILS") section.open = true;
  if (focus) {
    (section.querySelector(":scope > summary") || section).focus({ preventScroll: true });
    section.scrollIntoView({ block: "start" });
  }
}

function syncChrome(route) {
  document.body.dataset.view = route;
  if (route === "team" && data && !team.signInChecked) { team.signInChecked = true; checkSignIn().then(renderTeam); }
  if (route === "team" && data && (team.status === "idle" || (team.status === "ok" && Date.now() - team.fetchedAt > TEAM_CACHE_MS))) loadTeam(false);
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

function showSubTab(id) {
  const btn = byId(id);
  if (btn && window.bootstrap && window.bootstrap.Tab) window.bootstrap.Tab.getOrCreateInstance(btn).show();
}

function showTab(route) {
  if (!window.bootstrap || !window.bootstrap.Tab) return;
  const btn = document.querySelector(`[data-bs-toggle="tab"][data-route="${route}"]`);
  if (btn) window.bootstrap.Tab.getOrCreateInstance(btn).show();
}

function onBrowserNav() {
  const target = resolveRoute(location.hash.replace(/^#/, ""));
  const r = target.route;
  if (location.hash !== "#" + r) history.replaceState(null, "", "#" + r);
  if (r !== activeRoute()) showTab(r);
  else syncChrome(r);
  if (target.section) openSection(target.section);
  if (target.tab) showSubTab(target.tab);
}

function focusPackage(wp) {
  const esc = window.CSS && CSS.escape ? CSS.escape(wp) : wp;
  const details = document.querySelector('.work-package[data-wp="' + esc + '"]');
  if (!details) return;
  const open = () => {
    openSection("plan-packages", false);
    details.open = true;
    const s = details.querySelector("summary");
    if (s) s.focus();
  };
  if (activeRoute() === "plan") open();
  else {
    const btn = document.querySelector('[data-bs-toggle="tab"][data-route="plan"]');
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
    const destination = resolveRoute(target.dataset.go);
    const route = destination.route;
    e.preventDefault();
    showTab(route);
    if (destination.section) openSection(destination.section, !target.dataset.wp);
    if (destination.tab) showSubTab(destination.tab);
    if (route === "plan" && target.dataset.wp) focusPackage(target.dataset.wp);
    if (route === "presentations" && /^\d+$/.test(target.dataset.presentation || "")) {
      const card = document.querySelector('.presentation-card[data-review-week="' + target.dataset.presentation + '"]');
      if (card) {
        card.open = true;
        card.querySelector("summary").focus({ preventScroll: true });
        card.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      }
    }
  });
}

/* ---------------- Resources: embedded measurement campaign ----------------
 * measurements.html is generated outside this repository and loads only when its tab is first
 * shown (about 6 MB). The page reports its height and scroll targets with postMessage, so the
 * frame needs no fixed height and works on file:// as well as on GitHub Pages.
 */
function wireCampaign() {
  const frame = byId("campaign-frame");
  if (!frame) return;
  document.addEventListener("shown.bs.tab", (e) => {
    if (e.target && e.target.id === "resources-tab-campaign" && !frame.getAttribute("src")) frame.setAttribute("src", frame.dataset.src);
  });
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (e.source !== frame.contentWindow || !msg || msg.source !== "dpv-campaign") return;
    if (typeof msg.height === "number" && msg.height > 0) frame.style.height = Math.ceil(msg.height) + "px";
    if (typeof msg.scroll === "number") {
      const top = frame.getBoundingClientRect().top;
      if (msg.scroll > 0 || top < 0) {
        window.scrollTo({ top: top + window.scrollY + msg.scroll - 16,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      }
    }
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
  wireCampaign();
  onBrowserNav();
  wireControls();
  try {
    const response = await fetch(DATA_URL, {cache:"no-cache"});
    if (!response.ok) throw new Error("Project data is unavailable.");
    data = await response.json();
    if (!data.project || !Array.isArray(data.packages) || !Array.isArray(data.teams)) {
      throw new Error("Invalid project data.");
    }
    indexMilestones();
    ensureControls();
    renderAll();
    if (activeRoute() === "team") { team.signInChecked = true; checkSignIn().then(renderTeam); loadTeam(false); }
    setStatusAlert("", false);
  } catch (error) {
    clear(byId("overview-update"));
    setStatusAlert("The project data could not be loaded. Refresh the page to try again. The Excel work plan is still available above.", true);
  }
}

initialise();
