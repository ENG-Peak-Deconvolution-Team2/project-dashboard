# Peak Deconvolution — Team 2 Dashboard

[Open dashboard](https://eng-peak-deconvolution-team2.github.io/project-dashboard/) · [Edit project data](https://github.com/ENG-Peak-Deconvolution-Team2/project-dashboard/edit/main/data/project.json)

**Last verified: 2026-09-24.**

An English project dashboard exclusively for **Team 2 — Machine learning**.
Members: Hıba Berchane (BME) and Hasan Oruçlar (EEE), presented with equal prominence.

## Sections

| Section | Route | Content |
|---|---|---|
| Overview | #overview | Scope, programme timeline, next presentation, team and selected-week tasks |
| Project plan | #plan | Gantt schedule, work packages and risk/solution records in three expandable sections |
| Presentations | #presentations | Weeks 3, 5, 7, 10, 12 and 14: proposed expectations and evidence |
| Results & resources | #results | Experiment records, planning workbook, datasets and literature |
| Project journal | #journal | Historical planning decisions and recorded meetings |

The five panel shells and their navigation buttons are static HTML. Content
is rendered from `data/project.json`; there is no backend, browser editor or
browser-local content storage.

Project plan uses native expandable sections, without additional tabs. Existing
links to `#schedule`, `#packages`, `#risks` and `#resources` still open the relevant
section within its new parent page. Package links also expand the requested
work package. Navigation does not clone or move any panels at runtime.

## Plan authority and interpretation

- Task names, weeks, package titles and department responsibilities follow
  `plan/excel/PeakDeconv_Gantt_Chart.xlsx` in the research workspace.
  The dashboard contains 6 packages, 23 tasks and 15 planning weeks.
- Presentation weeks are explicitly marked **PRESENTATION** in row 9 of the
  Gantt chart sheet: weeks **3, 5, 7, 10, 12 and 14**.
- Week 8 is the midterm. No tasks are scheduled in weeks 1 or 8.
- The week selector chooses a position in the plan, not the current calendar
  week. No semester start date has been assumed.
- Presentation expectations are **proposed Team 2 briefing content**, derived
  from the scheduled tasks. They are not a copied supervisor rubric or a claim
  that those tasks are complete. Confirm and edit them as requirements develop.
- Risk records are **potential scenarios and proposed responses**. Their initial
  status is `To review`; severity, occurrence and owner acceptance are not
  inferred. `suggestedOwner` identifies a proposed departmental lead.
- The original Gantt workbook is included unchanged in `documents/`. It retains
  its original sheets; the dashboard itself displays only Team 2.
- The dashboard presents both members equally, without a project-lead label,
  following the project owner's display decision on 2026-09-24.
  The three historical decisions follow
  `plan/excel/WP1_literature_review_cikarildi.md` (2026-09-22).
- Excel changes are not imported automatically. Update JSON and the downloadable
  workbook snapshot together when the plan changes.

## Updating the dashboard

Both collaborators need repository write access. Start from the latest version
of `data/project.json`, edit the required records, update `project.updated`,
and commit to `main`. GitHub Pages republishes automatically. Resolve conflicting
edits instead of replacing the file with an older copy.

Stable identifiers: `team2`, `WP1`–`WP6`, task IDs such as `WP3.1`, risk IDs
such as `R01`, and resource IDs. Keep existing identifiers when editing.

### Task status and outputs

Each task retains `id`, `name`, `weeks`, `owner`, `modelling`, `status`,
and `outputs`. Status values: `Not reported`, `Planned`, `In progress`,
`Complete`, `Blocked`.

```json
"status": { "team2": "In progress" },
"outputs": [{ "label": "Report", "href": "documents/report.pdf" }]
```

This is a schema example, not a recorded output. Upload a real file or supply a
real URL before adding a link. Owner labels remain the Excel assignments:
`BME lead`, `EEE lead` and `BME+EEE`.

### Presentation records

The `presentations` array contains one record per presentation week:

| Field | Meaning |
|---|---|
| `week` | A week marked as a presentation in `milestones` |
| `title` | Review theme |
| `packages` | Related package IDs, rendered as links |
| `expectations` | Array of proposed talking points |
| `evidence` | Outputs to bring to the review |
| `status` | Presentation record status; initially `Not recorded` |
| `outputs` | Real slide/report links as `{label, href}`; initially empty |

Selecting a planning week updates the next-presentation card and timeline
highlight. Earlier reviews are labelled “Earlier in the plan”, never
automatically marked as presented. Week 15 correctly has no further scheduled
presentation.

### Risk records

The `risks` array contains:

| Field | Meaning |
|---|---|
| `id`, `title` | Stable risk ID and concise description |
| `packages` | Related work-package IDs |
| `trigger` | Early warning |
| `impact` | Potential project impact |
| `mitigation` | Proposed response |
| `fallback` | Fallback plan |
| `suggestedOwner` | Proposed lead; does not assign a person automatically |
| `status` | Review status; initially `To review` |

The initial eight scenarios cover acquisition delays, measurement quality,
data leakage, weak model performance, reference/local-data differences,
explanation reliability, interface output errors and unsupported query answers.
They do not amend scientific protocols or authorise changes to project scope.

### Other collections

- `teams`: one object, `team2`, with `name`, `approach`, and
  `members: [{name, department}]`.
- `milestones`: `{week, title, type}`; type is `presentation` or `midterm`.
- `experiments`: `{id, title, team: "team2", dataset, task, model, date,
  metrics: [{name, value, unit}], notes, href}`. Empty until real runs are recorded.
- `resources`: `{id, type, title, description, href, label}`.
  Use null links for descriptions without a downloadable or linked source.
- `decisions` and `meetings`: `{date, title, summary, actions: []}`.
  Actions: `{title, owner, due, status}`.
- `project`: name, description, updated, planVerified, weeks, startDate,
  repositoryUrl and siteUrl. The start date remains null until confirmed.

All JSON text is rendered as text, and links are restricted to HTTP(S) or
same-site relative paths.

## Local use and publication

From this directory:

```bash
python -m http.server 8000
```

Open http://localhost:8000/. HTTP is required because the page loads JSON;
double-clicking the HTML through a file URL does not provide that environment.

Publish only this directory's contents to the separate dashboard repository.
GitHub Pages uses the `main` branch, root folder. The private research
repository, source data and unrelated documents are not part of the site.

## Design and validation

The Team 2 revision uses a navy sidebar, a decorative signal motif, violet and
teal accents, colour-coded package timelines, presentation cards and risk
response panels. The header signal is decorative artwork, not measured data.

Bootstrap 5.3.8 and its MIT license are included locally. Fira Sans and Source
Serif 4 are bundled with their SIL Open Font Licenses in `assets/fonts/`.
Earlier design research used [EMBL's guidelines](https://www.embl.org/guidelines/design/)
and [frontend-design guidance](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md);
these are references, not institutional affiliations.

The five-section layout keeps the full masthead on Overview and uses compact
headers on the other pages. Plan groups show live content counts and distinct
colour accents; results and resources sit side by side on wide screens.
Presentation expectations and risk responses use 16 px body text.

Our team appears directly below the project masthead on all five pages. Equal
member cards show names and full departments, side by side on larger screens
and stacked on phones. The band uses a violet-to-teal accent and subtle rings;
team prominence and overflow are checked at 1440, 900, 390 and 320 px.

All five sections are checked in Chrome at desktop, tablet and mobile widths. Checks
cover overflow, fonts, navigation, direct routes, history, planning-week changes,
the midterm gap, presentation links and package links. Static validation checks
unique IDs, panel/route correspondence, local assets, JavaScript syntax, exact
task-plan agreement with Excel and the unchanged downloadable workbook.

Motion uses native CSS alongside the existing Bootstrap tabs: a finite signal
trace and light sweep, brief peak pulses, section entrances, staggered scope
cards, disclosure entrances and pointer hover feedback. Intro effects finish
within four seconds. Effects are disabled for reduced-motion preferences and
printing; content never depends on an observer or animation to become available.


## Saved favorite and former experimental address

The light theme from commit `2885b94` is the selected design, pinned by the
publication tag `favorite-2026-09-24`. Both `index.html` and `experimental.html`
now show that same dashboard, so the previously shared experiment link remains
usable. Team placement and the restrained CSS transitions are retained.

The interactive signal playground, midnight/neon theme, pointer lighting and
card tilt have been removed, together with their experimental CSS and script.
The previous experiment remains in Git history at commit `0d8017e`.
