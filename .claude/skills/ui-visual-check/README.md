# /ui-visual-check — look at the running UI, and measure it

![Version](https://img.shields.io/badge/version-1.2-0d7377)
![Status](https://img.shields.io/badge/status-stable-2e7d32)
![Python](https://img.shields.io/badge/Python-3.10%2B%20stdlib-3776AB?logo=python&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-Chrome%20%C2%B7%20Edge%20%C2%B7%20Chromium-4285F4?logo=googlechrome&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude%20Code-skill-D97757)
![Tests](https://img.shields.io/badge/tests-16%2F16-2e7d32)
![License](https://img.shields.io/badge/License-All%20rights%20reserved-red)

Checks a UI change in the running app at standard screen sizes by measuring the rendered page, and pictures a fix before and after so a person can decide.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Getting Started](#-getting-started)
- [Architecture](#️-architecture)
- [Development & Verification](#-development--verification)
- [Known Issues](#️-known-issues)
- [Plans](#-plans)
- [Change History](#-change-history)
- [License](#-license)

---

## 📖 Overview

`/ui-visual-check` checks a UI change in the running app at standard screen sizes. Its rule is **measure the DOM; a screenshot is not a check**: a column clipped by its container is simply not painted, so a full-page image can look normal while a control sits off-screen. Every verdict rests on figures from the layout (`getBoundingClientRect`, computed styles, `elementFromPoint`). Images are for the decision a person has to make, and for showing that the figures describe what they seem to.

The browser runs headless over the DevTools protocol. The probes find horizontal overflow, clipped or truncated text, covered and overlapping controls, small targets, low contrast, broken or distorted images, fixed bars that cover content, long lines and a missing viewport meta tag, plus design statistics (font sizes, families, colours, spacing off the 4 px grid).

| | |
|---|---|
| **Current version** | 1.2 |
| **Status** | Stable. The scripts are the ones [`/detect`](../detect/) uses for its UI review (since detect 1.8.1); all three modes were tested end to end on detect's UI fixture (22/22, including a fix that reveals a panel) |
| **Installs as** | `.claude/skills/ui-visual-check/` (one project) or `~/.claude/skills/ui-visual-check/` (all projects) |
| **Package** | [`dist/ui-visual-check-skill.zip`](dist/ui-visual-check-skill.zip) (unzips to `ui-visual-check/`) |
| **Requires** | Python 3.10+ (standard library only) and an installed Chrome, Edge or Chromium. No Node, Playwright or browser download |
| **Pairs with** | [`/detect`](../detect/), whose UI review uses the same scripts |

### Modes

| You want to… | Mode | What you get |
|---|---|---|
| Check a change you are about to make, or choose between options | `compare` | A before image, the fix injected live into the page, an after image in the same frame, figures before and after, a verdict (`yes` / `no` / `unmeasured`) and a regression sweep at every other width: `new` (the fix breaks that width) and `still` (the fix does not work there) |
| Check a change you have already made | `survey` before and after, then `diff` | Every route × width that got better or worse (issue kinds, page size, new console errors), `diff.json` with the image pair of each changed cell, exit code 1 when anything got worse |
| Investigate a layout problem | `survey` | A full-page image and the probe figures for every route at every width, plus your own `probe_js` measurements |

Widths: `standard` is 360, 390, 768, 1024, 1280, 1440 and 1920 px; `deep` adds 320, 412 and 2560; or give your own list. Pages can also be checked in a dark theme.

### Safety

- The app must already be running, or is started only after asking (never installing dependencies to do so), and stopped afterwards.
- The browser blocks every request other than GET, HEAD and OPTIONS unless the plan allows it by pattern (typically just the sign-in POST).
- Credentials come only from environment variables.
- A proposed fix is injected into the page only. Nothing is written to the project until the user agrees.

### Limits

- **Chromium engine only.** It drives Chrome, Edge or Chromium. Safari (WebKit) and Firefox (Gecko) rendering is not checked.
- Probes measure layout. Alignment and spacing problems that change no measured figure get the verdict `unmeasured`, and the images are then the only evidence.

---

## 🚀 Getting Started

### Install

```bash
mkdir -p .claude/skills && unzip ui-visual-check-skill.zip -d .claude/skills      # one project
mkdir -p ~/.claude/skills && unzip ui-visual-check-skill.zip -d ~/.claude/skills  # all projects
```

`python3 scripts/ui_capture.py check` says which browser will be used and whether it starts. Set `DETECT_BROWSER` to a browser executable to choose another.

### Usage

```text
/ui-visual-check                               # ask what to check, find the running app
/ui-visual-check http://localhost:5173/orders  # this route
```

The skill writes a `plan.json` (base URL, widths, routes with a `ready` selector, optional sign-in, `issues` for `compare`) outside the project, then runs:

```bash
python3 scripts/ui_capture.py                                        # prints the plan format
python3 scripts/ui_capture.py survey  plan.json --out <dir>/before
python3 scripts/ui_capture.py survey  plan.json --out <dir>/after
python3 scripts/ui_capture.py diff    <dir>/before/survey.json <dir>/after/survey.json
python3 scripts/ui_capture.py compare plan.json --out <dir> [--only UI-003]   # --only re-pictures one issue, keeps the rest
```

### Outputs

The report names the URL, the tree that was running (commit and whether it was dirty), the browser, the widths, routes and themes checked, any rendering aids used, and the figures that decide the question with the images that show them.

---

## 🏗️ Architecture

### Folder layout

| Path | Contents | In the zip |
|---|---|---|
| [`SKILL.md`](SKILL.md) | The rules, how to choose a mode, the plan file, the three procedures and what to report | Yes |
| [`references/traps.md`](references/traps.md) | 103 portable traps that produce a plausible wrong result rather than an error; read before the first run in a project | Yes |
| [`scripts/ui_capture.py`](scripts/ui_capture.py) | `check`, `viewports`, `survey`, `compare` and `diff` | Yes |
| [`scripts/ui_probes.js`](scripts/ui_probes.js) | The DOM probes, selector naming and the annotation overlay | Yes |
| [`scripts/cdp.py`](scripts/cdp.py) | A standard-library DevTools client that finds and drives an installed Chromium-engine browser | Yes |
| [`README.md`](README.md) | This file | Yes |
| [`tools/sync_check.py`](tools/sync_check.py) | Checks that `scripts/` is byte-identical to `detect/scripts/`; `--fix` copies detect's versions over | No |
| [`tools/test_modes.py`](tools/test_modes.py) | End-to-end test of `survey`, `compare` and `diff` on detect's UI fixture | No |
| [`dist/`](dist/) | The packaged skill, `ui-visual-check-skill.zip` | No |

---

## 🧪 Development & Verification

**The three scripts are copies.** `detect/scripts/cdp.py`, `ui_capture.py` and `ui_probes.js` are the source of truth, and the files in `scripts/` here must stay byte-identical to them. Change them in `detect/`, never here, then copy them over and rebuild this skill's zip as well as detect's.

From the repository root:

```bash
python3 ui-visual-check/tools/sync_check.py         # OK, or which files differ (exit 1)
python3 ui-visual-check/tools/sync_check.py --fix   # copy detect's versions over the ones that differ
python3 ui-visual-check/tools/test_modes.py         # survey, compare and diff on detect/examples/ui-fixture (needs Chrome or Edge); 16/16 at 1.0 to 1.1, 22/22 at 1.2
```

Run `sync_check.py` before every release; it must print OK. Release steps are in the root [README](../README.md#releasing-a-skill).

---

## ⚠️ Known Issues

| Priority | Issue | Description |
|---|---|---|
| 🟡 Medium | **`diff` compares issue counts per kind** | A change that moves a problem without changing its count shows as `same`, so the image pairs of the targeted widths must still be looked at (`SKILL.md` §B step 4). |
| 🟡 Medium | **Safari and Firefox rendering is not covered** | That would need a WebKit or Gecko driver outside the standard library. |
| ⚪ Low | **Two copies of the scripts are kept in step by hand** | It relies on running `sync_check.py` before each release. |

---

## 📋 Plans

| Plan | Why & What |
|---|---|
| A shared install of the UI scripts | If a third skill needs `cdp.py`, `ui_capture.py` and `ui_probes.js`, install them once and share them instead of keeping a further copy in step with `sync_check.py`. |

---

## 📜 Change History

*Workload* is the active working time a change took, in minutes, not the calendar time between its start and end. It is measured from the Claude Code session logs with [`.claude/tools/workload-minutes.sh`](../.claude/tools/workload-minutes.sh) (repository root): a stretch counts as active when its log entries are at most 15 minutes apart, or a tool call or background task was still running across the gap (at most 2 hours). **Parallel work counts once per agent:** the main session's and every subagent's transcripts are measured separately and summed, so an hour in which three agents worked counts three hours. When one window produced several changes, its transcripts were split between them by what each agent did.

**Entries: 4 · Total workload: 8 min (≈ 0.1 h).**

| Date | Version | Workload (min) | Change |
|---|---|--:|---|
| 2026-10-11 | 1.0 | 8 | <details><summary>Made generic from an earlier project's candidate…</summary>Made generic from an earlier project's candidate `ui-visual-check`, a 93 KB harness diary for one app. Its app-specific recipes (ports, component-library selectors, that app's pages) were dropped. Its portable method had already gone into `/detect` 1.8 (`detect/references/visual-method.md`); this skill now runs the same method on its own, with detect's scripts instead of a hand-written harness (copies kept identical by `tools/sync_check.py`). The traps that kept recurring in the diary are collected in `references/traps.md` (103 entries). New with this release, in the shared scripts: the `diff` mode, `still` in the regression sweep, `--only` merging into the existing `compare.json`, and per-route `probe_js`. `tools/test_modes.py`: 16/16 end to end. The figure is this skill's share of a 22-minute window that also produced [`/api-smoke-test`](../api-smoke-test/) 1.0 and `/detect` 1.8.1.</details> |
| 2026-10-15 | 1.0.1 | 0 | <details><summary>`scripts/cdp.py` synced from detect 1.9…</summary>`scripts/cdp.py` synced from detect 1.9 with `tools/sync_check.py --fix`: reading the browser's DevTools port file is retried while Windows still holds it open (one start in 18 failed when four browsers started at once), and a job retries once with a fresh browser. Backwards compatible. Its workload is counted in detect 1.9, where the change was made.</details> |
| 2026-10-15 | 1.1 | 0 | <details><summary>Shared UI scripts from detect 1.10: off-screen controls, a stricter compare verdict…</summary>`scripts/ui_probes.js` and `scripts/ui_capture.py` synced from detect 1.10 with `tools/sync_check.py --fix`. New issue kind `offscreen_control`: a control outside the phone's visible screen that no scroll container can bring into view, measured against `window.visualViewport`, with RTL pages panned to their start first. Overlap and `obscured` use the painted rectangle; text over an image is unmeasurable instead of a 1:1 contrast failure; layers painted behind the content are ignored. `compare` judges `offscreen_control`, accepts `must_be_visible` and `judge_kinds` in a plan issue, does not count a revealed element's old issues against a fix, and writes a `judgement` with its reason. Labels always use Latin digits; annotation boxes on fixed elements sit on the element; hash routes no longer wait for a load event; `--out .` paths fixed; `--help` exits 0. `tools/test_modes.py` 16/16. Its workload is counted in detect 1.10, where the change was made.</details> |
| 2026-10-15 | 1.2 | 0 | <details><summary>Shared UI scripts from detect 1.11: machine-readable reasons, revealed content judged against itself…</summary>`scripts/ui_capture.py` and `scripts/ui_probes.js` synced from detect 1.11. `compare.json`'s `judgement` gains `reason_code` and `reason_args` next to the English `reason`, and each `must_be_visible` control gets a `code` and `args`, so a report can translate them. Issues on content a fix brings into view are compared with that content's own measurements from before the fix: merely present stays information, worse counts against the fix (`judgement.worsened`, `reason_code: revealed_worse`). `tools/test_modes.py` gains mode D (detect's new `reveal.html` fixture): 22/22. Its workload is counted in detect 1.11, where the change was made.</details> |

---

## 📄 License

There is no `LICENSE` file in this repository. No licence is granted: all rights are reserved by the owner (Ali Zarrabi) until one is added.
