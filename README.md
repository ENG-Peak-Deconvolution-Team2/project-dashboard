# Peak Deconvolution — Team 2 Dashboard

Team 2 is the default view. The shared plan and Team 1 reference remain available
through the team selector; they retain the common schedule from the source Excel.

[Open dashboard](https://eng-peak-deconvolution-team2.github.io/project-dashboard/)
· [Edit project data](https://github.com/ENG-Peak-Deconvolution-Team2/project-dashboard/edit/main/data/project.json)

**Last verified: 2026-09-23.**

A static, English project-management and presentation dashboard for the Peak
Deconvolution project (voltammetric data acquisition, predictive modelling and
explainable analysis). It is a plain static site: no backend, no build step,
no editor, no localStorage. All content is read from one data file,
`data/project.json`, loaded by `app.js` at page load.

## Source provenance

Every schedule fact in `data/project.json` comes from these sources, in this
order of authority:

1. **`plan/excel/PeakDeconv_Gantt_Chart.xlsx`** — the planning spreadsheet,
   verified against it on **2026-09-23** (`project.planVerified`). Task
   names, week ranges, owners (`BME lead` / `EEE lead` / `BME+EEE`) and the
   modelling flags for WP3.1–WP3.3 and WP4.2–WP4.4 are taken verbatim from
   its Gantt chart and Task overview sheets. This file is the authority; the
   dashboard is a faithful projection of it.
2. **`plan/excel/PeakDeconv_Gantt_Chart.html`** — HTML preview of the same
   schedule; used for the team member names and the presentation weeks
   (3, 5, 7, 10, 12, 14). Its older footer wording was **not** copied into
   the dashboard.
3. **`plan/excel/PROJE_BAGLAMI.md`** — project ownership record: Hasan
   Oruçlar is the **project lead** and also a Team 2 EEE member.
4. **`plan/excel/WP1_literature_review_cikarildi.md`** — dated plan-decision
   record (2026-09-22): the literature review was removed as a separate work
   package (remaining packages renumbered WP1–WP6), the old natural language
   interaction package was replaced by WP5 · Explainable AI (XAI), and the
   NLP scope was reduced to the single task WP6.3 · Chatbot integration
   (result queries). Only these established historical decisions appear in
   `decisions`; no invented decisions are added.

Source paths above refer to the original research workspace. The downloadable
plan snapshot is included under `documents/`; the other source notes are not
part of this site.

## Important semantics

- **Weeks are planning positions, not calendar dates.** The week selector
  (`week-filter`) chooses the *selected planning week* (1–15, default 2); it
  is not "this week" and is never derived from the current date. The project
  has no fixed calendar start date (`project.startDate` is `null`).
- **No automatic synchronisation from Excel.** If the spreadsheet changes, a
  human edits `data/project.json` (see "Updating the data"). Nothing in the
  site reads or parses the spreadsheet.
- **Preserve IDs.** Team IDs (`team1`, `team2`), package IDs (`WP1`–`WP6`),
  task IDs (`WP1.1`…), and resource IDs are stable identifiers
  referenced by the application and by future records. Keep them unchanged
  when editing; add new records with new IDs.
- **No invented progress.** The data holds only the plan. Task status starts
  as `Not reported` for both teams everywhere; results, experiments and
  meetings are empty until someone records them.
- Week 8 is the **midterm** column in the schedule; no task is planned in
  week 8 (weeks in the plan exclude week 8).

## Layout

```
eng-dashboard/
├── index.html            # single page, six static navigation panels
├── app.js                # renders data/project.json
├── style.css             # responsive visual design
├── assets/               # Bootstrap 5.3.8 CSS/JS, MIT license and favicon
├── documents/            # downloadable resources referenced by project.json
│   └── PeakDeconv_Gantt_Chart.xlsx   # copy of the authoritative schedule
├── data/
│   └── project.json      # the only data file — this contract
└── README.md             # this file
```

The six navigation panels are: Overview, Plan & schedule, Work packages,
Experiments & results, Resources, Meetings & decisions. Routes are hash-based
(`#overview`, `#schedule`, `#packages`, `#results`, `#resources`, `#journal`,
default `#overview`).

## Running locally

From the `eng-dashboard` directory (the directory that contains `index.html`):

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>. Any port works; use the port you pass to
`http.server`. The site must be served over HTTP (not opened as `file://`)
because `app.js` fetches `data/project.json`.

## Deploying to GitHub Pages (site root)

This directory is the deployment unit. To publish separately, copy its contents
into a checkout outside the research repository. Deploy from the repository root:

1. Push the contents of `eng-dashboard/` to a repository
   (e.g. `<user>.github.io` or any repo with Pages enabled).
2. Repository settings → Pages → **Source: Deploy from a branch** → branch
   `main`, folder **`/ (root)`**.
3. Set `project.siteUrl` in `data/project.json` to the published address
   (e.g. `https://<user>.github.io/<repo>/`) once known. Relative resource
   links such as `documents/PeakDeconv_Gantt_Chart.xlsx` resolve correctly
   from the root deployment; if the site is later moved to a
   project page path (`/<repo>/`), keep resource `href` values relative so
   they keep working.

`project.repositoryUrl` (also `null` until the repository is public) enables
the external repository link in the page; it stays hidden while `null`.

## Updating the data (both collaborators)

The dashboard has no in-browser editor. To change anything — status,
experiments, meetings, resources — edit `data/project.json` on GitHub and
commit:

1. Open the repository on GitHub and go to `data/project.json`.
2. Click the pencil icon (**Edit this file**). Edit only the JSON values you
   need; keep valid JSON (commas, quotes, no trailing commas). Do not
   rename or reorder IDs; only add new entries for new records.
3. Scroll down and commit: write a short message (e.g.
   `WP3.1 team1: In progress`), choose **Commit changes** directly to
   `main`.
4. GitHub Pages rebuilds the site. Wait for the deployment to complete, then
   refresh the dashboard to see the new content.

Both collaborators need write access to the repository. Start each edit from
the latest version. If GitHub reports conflicting changes, reconcile both
updates before committing; avoid replacing the entire file with an old copy.

After each change, also bump `project.updated` to the change date (the
footer "last content update" reads it).

### Task status values

Each task carries one status **per team**, and every per-team status may be
only one of:

- `Not reported` (initial value for all tasks, both teams)
- `Planned`
- `In progress`
- `Complete`
- `Blocked`

```json
"status": { "team1": "Not reported", "team2": "In progress" }
```

### Collections and schemas

`data/project.json` is a single JSON object with these top-level
collections. Examples below show the shape a record must have; **the values
in examples are documentation only and are not live data** — the live file
contains only the planned schedule plus whatever collaborators have
recorded.

#### `project` — object

| field | type | meaning |
|---|---|---|
| `name` | string | Project name |
| `description` | string | One-line scope |
| `lead` | string | Project lead (project-wide role, not a team seat) |
| `updated` | string `YYYY-MM-DD` | Last content update date (shown in footer) |
| `planVerified` | string `YYYY-MM-DD` | Date the plan was last verified against the Excel |
| `weeks` | number | Number of planning weeks (15) |
| `startDate` | string `YYYY-MM-DD` or `null` | Calendar start; `null` = not fixed |
| `repositoryUrl` | string or `null` | Public repository URL; `null` hides the link |
| `siteUrl` | string or `null` | Published site URL |

#### `teams` — array of team objects

```json
{
  "id": "team1",
  "name": "Team 1",
  "approach": "Deep learning",
  "members": [
    { "name": "Sıla Elif Kocasaraç", "department": "BME" },
    { "name": "Batu Arıbakır", "department": "EEE" }
  ]
}
```

`id` is `team1` or `team2`. `approach`: Team 1 is deep learning (DL), Team 2
is conventional machine learning (ML). The project lead also appears as a
team member; the lead badge on the overview comes from `project.lead`
matching a member name.

#### `packages` — array of work-package objects (WP1–WP6, in plan order)

```json
{
  "id": "WP3",
  "name": "Model Development and Evaluation",
  "shortName": "Modelling",
  "summary": "Develop and compare detection and quantification models on the existing dataset.",
  "color": "#726dc4",
  "tasks": [
    {
      "id": "WP3.1",
      "name": "Analyte presence detection",
      "weeks": [2, 3, 4],
      "owner": "EEE lead",
      "modelling": true,
      "status": { "team1": "Not reported", "team2": "Not reported" },
      "outputs": []
    }
  ]
}
```

| field | meaning |
|---|---|
| `id` | `WP1`–`WP6`, stable |
| `name` / `shortName` | Exact Excel package title / short label (Acquisition, Preprocessing, Modelling, Adaptation, Explainability, Interface) |
| `summary` | One-sentence faithful purpose |
| `color` | Package accent color (WP1 `#009289`, WP2 `#00578c`, WP3 `#726dc4`, WP4 `#772f6f`, WP5 `#946200`, WP6 `#bb565a`) |
| `tasks[].id` | `WPx.y`, stable |
| `tasks[].weeks` | Planning weeks (1–15) in which the task is scheduled; never 8 |
| `tasks[].owner` | `BME lead` (BME primary, EEE support) / `EEE lead` (EEE primary, BME support) / `BME+EEE` (shared); roles apply within both teams |
| `tasks[].modelling` | `true` for modelling tasks (WP3.1–WP3.3, WP4.2–WP4.4) where Team 1 works DL and Team 2 works ML |
| `tasks[].status` | Per-team status, one of the five values above |
| `tasks[].outputs` | Safe links to recorded outputs; `[]` until something exists |

#### `milestones` — array

```json
{ "week": 5, "title": "Progress presentation", "type": "presentation" }
```

`type` is `presentation` (weeks 3, 5, 7, 10, 12, 14) or `midterm` (week 8).
Milestones are scheduled plan events — no calendar dates, no completion
claims.

#### `experiments` — array (empty until recorded)

Each recorded experiment identifies dataset, team, method and evaluation
metrics. Example record:

```json
{
  "id": "exp-001",
  "title": "Detection baseline on existing dataset",
  "team": "team1",
  "dataset": "ACS-ML-Biomarker",
  "task": "WP3.1",
  "model": "CNN detection baseline",
  "date": "2026-10-02",
  "metrics": [
    { "name": "Accuracy", "value": 0.91, "unit": null },
    { "name": "F1 (positive class)", "value": 0.88, "unit": null }
  ],
  "notes": "Training split only; no test-set numbers.",
  "href": null
}
```

`team` is `team1` or `team2`; record each team's independent run separately. `task` is the
related task ID, `metrics` is an array of `{name, value, unit}` (use
`null` for unitless values), `date` is the run date, `href` is an optional
link to a report. Records appear in the Experiments & results panel as
added; the panel shows an honest empty state while the array is empty.

#### `resources` — array

```json
{
  "id": "gantt",
  "type": "document",
  "title": "Project work plan",
  "description": "15-week work packages and team assignments.",
  "href": "documents/PeakDeconv_Gantt_Chart.xlsx",
  "label": "Download Excel"
}
```

`type` groups the panel (e.g. `document`, `dataset`, `literature`).
`href` is a real, relative same-site path (or `http(s)` link) — dataset
description cards that are only descriptions carry `href: null` and render
without a link. No invented sources; links are only added when the
referenced material exists.

#### `decisions` — array (historical plan decisions)

```json
{
  "date": "2026-09-22",
  "title": "Literature across work packages",
  "summary": "Literature review supports all packages and is not a separate work package.",
  "actions": []
}
```

`actions` is an array of action items in the meeting action shape below
(`[]` for simple decisions). Decisions are historical plan decisions from
the dated record `plan/excel/WP1_literature_review_cikarildi.md` — they are
not approved meeting minutes.

#### `meetings` — array (empty until recorded)

```json
{
  "date": "2026-10-01",
  "title": "Weekly coordination call",
  "summary": "Reviewed week 1 start and dataset labelling plan.",
  "actions": [
    { "title": "Finalise analyte list", "owner": "BME", "due": "2026-10-06", "status": "In progress" }
  ]
}
```

Action items: `{title, owner, due, status}` where `due` may be `null` and
`status` uses the same five values as task status. The Meetings & decisions
panel lists decision and meeting cards in date-descending order; while
`meetings` is empty it shows a separate honest empty message.

## Limitations

- The site derives counts and timeline views from `data/project.json`. Progress
  and experimental metrics must be entered explicitly; they are not inferred.
- No authentication, no write path from the browser, no server-side state.
- The XLSX copy under `documents/` is a snapshot; the spreadsheet in
  `plan/excel/` remains the authority and is re-verified manually when the
  plan changes.
