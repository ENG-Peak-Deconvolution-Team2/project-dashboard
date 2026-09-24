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
const ROUTES = ["overview", "plan", "presentations", "results", "journal"];
const ROUTE_ALIASES = {
  schedule: { route: "plan", section: "plan-schedule" },
  packages: { route: "plan", section: "plan-packages" },
  risks: { route: "plan", section: "plan-risks" },
  resources: { route: "results", section: "research-resources" }
};
const WEEKS_FALLBACK = 15;
const DEFAULT_WEEK = 2;

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
  const box = byId("overview-stats");
  if (!box) return;
  clear(box);
  const stats = [
    ["Work packages", (data.packages || []).length],
    ["Planned tasks", tasksOf().length],
    ["Presentations", presentationWeeks.size],
    ["Planning weeks", totalWeeks()],
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
  for (const p of reviews) {
    const isNext = p === next;
    const stop = el("button", "presentation-stop" + (isNext ? " is-next" : ""));
    stop.type = "button";
    stop.dataset.go = "presentations";
    stop.dataset.presentation = String(p.week);
    stop.setAttribute("aria-label", "View week " + p.week + " presentation expectations");
    stop.append(el("small", null, "Week"), el("strong", null, String(p.week).padStart(2, "0")));
    rail.appendChild(stop);
    const card = el("article", "presentation-card" + (isNext ? " is-next" : ""));
    card.dataset.reviewWeek = String(p.week);
    card.tabIndex = -1;
    const top = el("div", "presentation-top");
    const medallion = el("span", "week-medallion");
    medallion.append(el("small", null, "WEEK"), el("strong", null, String(p.week).padStart(2, "0")));
    const heading = el("div");
    const position = p.week === state.week ? "Selected planning week" : isNext ? "Next in the selected plan" : p.week < state.week ? "Earlier in the plan" : "Later in the plan";
    heading.append(el("h3", null, p.title), el("span", "review-position", position));
    top.append(medallion, heading);
    card.append(top, packageTags(p.packages), el("h4", "card-label", "Expected presentation content"));
    const items = el("ul", "expectation-list");
    for (const expectation of p.expectations || []) items.appendChild(el("li", null, expectation));
    card.appendChild(items);
    const evidence = el("div", "evidence-box");
    evidence.append(el("h4", "card-label", "Evidence to bring"), el("p", null, p.evidence));
    const footer = el("div", "review-footer");
    footer.appendChild(el("span", null, "Presentation record: " + (p.status || "Not recorded")));
    for (const output of p.outputs || []) {
      const a = outputLink(output);
      if (a) footer.appendChild(a);
    }
    card.append(evidence, footer);
    list.appendChild(card);
  }
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
      li.append(avatar, name, el("span", "member-dept", m.department || ""));
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
      return set.join(", ");
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
        const badge = el("span", "task-status status-" + status.toLowerCase().replace(/\s+/g, "-"), status);
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
  const exps = (data.experiments || []).filter(x => x.team === "team2");
  if (!exps.length) {
    const empty = el("div", "empty-state");
    empty.append(
      el("h3", null, "No results recorded yet"),
      el("p", "result-empty-note", "Team 2’s experiment records will appear here with their dataset, method and evaluation metrics. No experimental outcomes have been recorded yet.")
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
  renderPresentations();
  renderRisks();
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
  const target = resolveRoute(location.hash.replace(/^#/, ""));
  const r = target.route;
  if (location.hash !== "#" + r) history.replaceState(null, "", "#" + r);
  if (r !== activeRoute()) showTab(r);
  else syncChrome(r);
  if (target.section) openSection(target.section);
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
    if (route === "plan" && target.dataset.wp) focusPackage(target.dataset.wp);
    if (route === "presentations" && /^\d+$/.test(target.dataset.presentation || "")) {
      const card = document.querySelector('.presentation-card[data-review-week="' + target.dataset.presentation + '"]');
      if (card) {
        card.focus({ preventScroll: true });
        card.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
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
    setStatusAlert("", false);
  } catch (error) {
    clear(byId("overview-stats"));
    setStatusAlert("The project data could not be loaded. Refresh the page to try again. The Excel work plan is still available above.", true);
  }
}

initialise();
