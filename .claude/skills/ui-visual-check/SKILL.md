---
name: ui-visual-check
description: Check a UI change in the running app at standard screen sizes — measure the rendered page (overflow, clipping, overlaps, covered controls, small targets, contrast, distorted images) instead of trusting a screenshot, picture a proposed fix before and after injecting it, or compare the whole UI before and after a code change. Use when verifying a visual change, checking responsive behaviour, taking screenshots for a decision, or investigating a layout or overflow problem.
argument-hint: "[URL or route] (optional)"
allowed-tools: Read, Write, Bash(python3:*), Bash(git status:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git log:*)
---

# /ui-visual-check — look at the running UI, and measure it

`<skill>` below is this skill's base directory. The scripts in `<skill>/scripts/` use only the Python 3.10+ standard library and drive any installed Chrome, Edge or Chromium headless; nothing has to be installed. `python3 <skill>/scripts/ui_capture.py check` says which browser will be used.

**Measure the DOM; a screenshot is not a check.** A column clipped by its container is simply not painted, so a full-page image can look normal while a control sits off-screen. Every verdict here rests on figures from the layout (`getBoundingClientRect`, computed styles, `elementFromPoint`). Images are for the decision a person has to make, and for showing that the figures describe what they think they describe.

## Rules

1. **The app must already be running, or be started only after asking.** Use the URL the user gives. Otherwise propose the dev-server command and start it only on a yes, never installing dependencies to do so. Stop it afterwards if you started it.
2. **Writes are blocked.** The browser refuses every request other than GET, HEAD and OPTIONS unless the plan allows it by pattern (`allow_requests`: exactly the sign-in POST). Never disable this for a walk, and never assume a form's own validation stops a save. Many forms post invalid data and leave it to the server.
3. **Credentials only from environment variables** (`auth.steps[].env`, `headers_env`). Never in the plan, a command line or the chat.
4. **A proposed fix is injected into the page only**, never written to the project, until the user agrees to it.
5. **Read [`references/traps.md`](references/traps.md) before the first run** in a project. Almost every entry there produced a plausible wrong result rather than an error.

## Choose the mode

| You want to… | Do this |
|---|---|
| **Check a change you are about to make** (or choose between options) | §A · `compare`: before image, fix injected live, after image, figures, and the other widths re-checked |
| **Check a change you have already made** | §B · `survey` before the edit and after it, then `diff` |
| **Investigate a layout problem** | §C · `survey`, then read the figures and the images of the failing width |

### Plan file
Write `plan.json` with the Write tool (format: `python3 <skill>/scripts/ui_capture.py` with no arguments prints it). The essentials:

- `base_url`: the running app, or a folder of static pages relative to the plan file.
- `viewports`: `"standard"` (360, 390, 768, 1024, 1280, 1440, 1920), `"deep"` (adds 320, 412, 2560) or your own list.
- `routes`: each with a `ready` selector **that exists only once the page has loaded**, not in its skeleton, and is waited for as visible.
- Optional: `auth`, `allow_requests`, `hide` (cookie banners and other noise, declared as an aid in your report), `themes: ["light", "dark"]`, `map_localhost` (resolve `localhost` to 127.0.0.1 when IPv6 loopback is blocked), and per route `setup_js` (open a menu, scroll a list) and `probe_js` (your own measurement: an expression that returns a JSON string).

Keep the plan and the output folder outside the project, or in an ignored folder.

### A · Picture a proposed change
1. Add `issues` to the plan: `id`, `route`, `viewport` (the width where the problem shows), `selector` of the subject, `fix_css` and/or `fix_js` (`(on) => {…}`, called with `true` to apply), `shot` (`region` keeps the full page width so overflow stays visible; `element`; `viewport`), optional `design: {url, selector}` for a third image from the design source.
2. `python3 <skill>/scripts/ui_capture.py compare plan.json --out <dir>` writes `<ID>-before` and `<ID>-after` images and `compare.json`, with the figures before and after, the verdict and the `regression` list for every other width.
3. Read the verdict:
   - `yes`: a measured problem went away and nothing new appeared;
   - `no`: the fix adds a problem on this page;
   - `unmeasured`: the probes see no difference (alignment, spacing), so the images are the only evidence; say so.

   `judgement.reason` says why in English; `reason_code` and `reason_args` carry the same facts for a translated
   report. When the fix opens a window or panel, that content's own contrast, text-size, target and image issues are
   listed under `judgement.revealed` and do not count against the fix. They do count if the element is worse than it
   was before the fix (`judgement.worsened`, `reason_code: revealed_worse`), for example when the fix also shrinks its
   text.

   In `regression`, `new` means the fix breaks another width and `still` means it does not work at another width. Change the fix and re-run (`--only <ID>` re-pictures one issue and keeps the rest).
4. **The injected change must be exactly what you will write.** If the real change is a component parameter or a class, inject the class or attribute that parameter renders, not your own imitation of its effect, and check what else that parameter changes.
5. Show the pairs to the user (Read the images; for a decision, publish them side by side). When they choose, implement it, then re-check with §B.

### B · Check a change already made
1. **Before editing**, survey the current state: `ui_capture.py survey plan.json --out <dir>/before`. If the edit is already made, survey the base commit instead. Use a `git worktree` of it at a short path (no `#` or spaces), run its dev server on the same port with yours stopped, and say so in the report.
2. Make the change, **rebuild and restart after the last edit** (a dev server can keep serving the previous bundle), then survey again into `<dir>/after`.
3. `ui_capture.py diff <dir>/before/survey.json <dir>/after/survey.json` lists every route × width that got better or worse (issue kinds, page width and height, new console errors) and writes `diff.json` with the image pair of each changed cell. Exit code 1 means something got worse.
4. **Look at the image pairs of every changed cell and of the widths the change targets**, even where the counts did not move.

### C · Investigate a layout problem
Survey the route at all widths, then read `survey.json` for the failing width:
- `h_overflow`: what sticks out, and by how much;
- `clipped_text` / `truncated`: scroll size against client size;
- `obscured` / `overlap`: what covers what;
- `small_target`, `low_contrast` (ratio, colours), image problems, `fixed_cover`, `long_lines`, `no_viewport_meta`;
- the design statistics: font sizes, families, colours, spacing values off the 4 px grid.

Add a `probe_js` for anything specific (a cell's rect against its container's, a computed style). Return one joined string or a JSON string; a structured return value can arrive empty. Read the CSS rule that wins the cascade before proposing a fix, then switch to §A.

## Report

Say:
- which URL and **which tree** was running (`git rev-parse --short HEAD`, and whether `git status` was dirty), and the browser;
- which widths, routes and themes were checked, and which aids were used (hidden elements, outlines, disabled animations, mock data);
- the figures that decide the question, before and after, with the images that show them.

Prefer figures that can be re-checked later (a width, a count, a colour, a string) over "it looked right". If the figures will be recorded as a claim about what shipped, re-read them after the commit, or say they describe the working tree.
