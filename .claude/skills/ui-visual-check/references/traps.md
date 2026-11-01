# Traps when driving a browser to check a UI

This is a catalogue of the ways a browser-driven UI check goes wrong. It comes from long practice of checking UI changes on a real application (a single-page app with a component library, a remote database and a signed-in shell), with the project-specific detail removed. Almost none of these traps raises an error. Each one produces a **plausible wrong result**: a reading that looks like a defect in the page, or a clean pass that never measured anything. When a reading surprises you, check this list before you believe it, or before you report it.

Entries marked *(framework-specific)* apply only to that framework, but to every project that uses it. Entries marked *handled by ui_capture.py* are already taken care of by this skill's scripts; they are listed so you know why the script behaves as it does, and so a hand-written probe or driver does not reintroduce them.

## 1. Getting the app running and serving the right build

**Rebuild and restart after the last edit, not just after a rebuild.**
A dev server can keep serving the previous bundle after a rebuild, and edits made after the last restart are not in what the browser runs. The result is either a blank app where every ready selector times out (it looks as if the change broke the app) or a page that quietly behaves like the old code. Make "rebuild, restart" the step immediately before the run.

**Navigate after a restart before measuring anything.**
A tab that was open across a server restart keeps running the old bundle until its next navigation, so a first step that only resizes the viewport measures the previous build. Load the page again first.

**Check the build's exit status, not only the run's.**
A "run without building" command after a failed build cheerfully runs the previous binary, so a probe you just patched prints the old answer. Chain them (`build && run`) so a failed build cannot be followed by a successful-looking run.

**After a package upgrade, confirm the browser actually receives the new package.**
Build caches that compare file dates can skip regenerating an upgraded package whose files are dated earlier than the cached copy, so the app runs the old library code with the new CSS and nothing fails. Clear the build's intermediate cache after an upgrade, and check that the served package file changed (size or hash) before trusting any behaviour figure. *(Seen with Blazor WASM's `obj/.../webcil` cache.)*

**Use the host name the server's CORS policy allows.**
`localhost` and `127.0.0.1` are different origins. The page loads from either, but sign-in or API calls from the wrong one are refused by the browser before they reach the server, and nothing is logged: it looks like a broken login form. Use the host the dev CORS allowlist names, and the port and scheme it names (an http profile on another port is a different origin too).

**Where IPv6 loopback is blocked, map `localhost` inside the browser.**
`localhost` may resolve to `::1` first; if that is dropped the page never loads, while switching to `127.0.0.1` breaks the origin (above). Resolve the name inside the browser (`--host-resolver-rules=MAP localhost 127.0.0.1`), which keeps the `Origin` header right over IPv4. *Handled by ui_capture.py* (`map_localhost`).

**Tell the three causes of a ready-selector timeout apart by what the page shows.**
A wrong selector, a stale bundle and the code under test throwing all end with the same timeout. After a failed wait, print together: whether the framework's error banner is shown, whether the app shell (navigation, app bar) is present, the first few hundred characters of the content area's text, and the console errors and page errors collected since navigation. A thrown component leaves the shell standing with an error message in the content area; a stale bundle leaves the whole app blank; a wrong selector leaves a page that looks fine. Clear the collected console lines after sign-in so its noise is not in the report. An app-level error boundary can show an error while the framework's own error banner stays hidden, so the content text decides it.

**Check a 500 against the server log before blaming the page.**
A remote dev database that drops mid-run produces server errors that look like a broken page. Read the server's log for the time of the request, and record the URL of every response with status 400 or more, or a console error is unactionable.

**Some console errors are the driver's own.**
Navigating rapidly aborts responses still loading and logs errors for them. Discount errors that coincide with the driver leaving the page, and note them as such.

**A production build behaves differently, and needs its own setup.**
Service workers, caching and some configuration exist only in a published build. Run it on the port and origin the client is hard-wired to, with the dev server stopped. Intercept the worker's own requests at the browser-context level, not the page level: a page-level route never sees a service worker's `fetch`. To test starting offline, do one full online load first, since a worker usually caches the shell only on a load it controls.

## 2. Signing in and session state

**Sign in once and resize the same page between widths.**
A fresh browser context per width signs in once per width, and an auth endpoint with a rate limit (say five per minute) starts refusing partway through the run; later widths silently measure the sign-in page. One session also keeps in-memory and IndexedDB session state. *Handled by ui_capture.py* (signs in once, resizes the same page).

**A saved storage state may not carry the session.**
If the app keeps its token encrypted with a non-extractable WebCrypto key in IndexedDB, a saved cookies-and-localStorage state restores nothing usable. Sign in inside the same context that takes the measurements.

**Set app state through the storage the app actually reads, in the format it reads.**
A plausible value can mean something else: a font scale stored as a multiplier and snapped to the nearest allowed step reads `100` as the largest step; a theme enum where `1` means "system" (light, in headless) rather than dark; a string stored by a JSON-serialising storage wrapper needs its quotes (`JSON.stringify`). Each renders without error, at the wrong setting. Read the app's code for the key, its type and its allowed values.

**Have the probe report the state it actually got.**
Signed-in apps often fetch the user's saved preferences after load and write them over whatever the driver set, between your script and the first paint. Init scripts also run in the order they were added, so a second one can overwrite the first. Report the theme, scale or language the page actually resolved (a computed CSS variable, the computed `zoom` on the element that carries it, the stored key) in every reading. Find which element carries a zoom; reading it off the root when the app applies it lower down reports 1 at every scale.

**To keep a signed-in user's local setting, block the preference fetch, and know what that hides.**
Aborting the request that loads saved preferences usually makes the app fall back to its cached value, which is a real offline path rather than a fake one. But any surface that renders only once preferences load (a settings card, groups that open by preference) then disappears or starts in its default state. Do not block it when the subject of the measurement is fed by preferences.

**Reach a mid-sign-in page by fulfilling the sign-in response in the browser.**
Pages that exist only during a multi-step sign-in (a second factor, a recovery code) bounce to the sign-in page on direct navigation when the pending state is held in server memory. Fulfil the sign-in request inside the browser with the response that starts that step, so the real page routes itself and nothing reaches the server. A step that sends a code on arrival will then try a write; the write guard blocking it is the page working.

## 3. Waiting for the page

**The ready selector must exist only in the loaded state, and be waited for as visible.**
Many apps render a skeleton that draws the same cards, tiles or panels as the page, and keep the real content in the DOM behind `hidden` while loading. A wait on a selector both share returns against the skeleton, and the probe then measures a hidden copy whose elements all answer `querySelector` with zero-size rects. Before trusting a ready selector, check what the loading state renders, and pick something only the settled page has (a control inside the loaded card, a populated row). *Handled by ui_capture.py* (waits for visible, outside `[hidden]`), but choosing the selector is still yours.

**Never wait on a fixed timeout.**
A page backed by a remote database can take well over ten seconds to load, and a fixed wait lands mid-load on slow runs. Wait on a rendered selector. External sign-in providers redirect through JavaScript interstitials ("Redirecting…"), so a wait on the URL plus a pause lands on a blank page; wait for the credential field itself.

**While a skeleton shows, both the skeleton and the hidden page are in the DOM.**
The reverse trap: a probe of the loading state counts both and finds content that belongs to the page. Filter on `!el.closest('[hidden]')`. To hold a skeleton up long enough to measure it, stall its requests (a route handler that waits on a flag before continuing) rather than throttling the network.

**A skeleton-versus-page comparison must prove its page leg is the page.**
A perfect match between skeleton and page is suspicious: the page leg may have read the skeleton too. Read the skeleton count on the page leg, which must be zero, and wait for page content to be present and no skeleton to remain. "No skeleton" alone passes before the framework has rendered anything at all.

**An absence is only as good as the wait before it.**
A probe that waits for something the page never renders runs to its full timeout; meanwhile transient things (toasts, snackbars) disappear, and the probe honestly reports none. A wait that cannot succeed is a delay, not an error, and a delay looks like a clean result. Bound the wait by the page's own ready condition, and when a probe reports the absence of something transient, check what it waited on.

**Sample a transient that navigates away before it starts.**
To see what a page shows on its way out (sign-out, redirects), install a `requestAnimationFrame` sampler before the navigation and read its tally after, or you measure the next page.

**An empty output slot may be a step the probe never takes.**
A probe whose comment or output format promises a step (press Save, collect errors) may not actually do it, and an empty slot then reads as "the page shows nothing". When an empty reading matters, read the code that fills it.

## 4. Measuring

**Measure the DOM; a screenshot is not a check.**
A column clipped by its scroll container is simply not painted, so a full-page image looks normal while a control sits off-screen. Compare the element's rect with its container's rect, and check computed styles and `elementFromPoint`.

**A zero-size box is often `display: contents`.**
Component libraries wrap things in `display: contents` elements, which have no layout box and measure `0×0`, so a probe reading `children[0]` reports a missing or transparent chip that is fine. Query the component's own class, never `children[n]`, and print `getComputedStyle(el).display` beside every zero-size reading.

**Elements inside a collapsed container have real, plausible rects.**
A collapse done with `overflow: hidden` and a zero-height grid row leaves the children at full height and natural position, overflowing a zero-height box, with `offsetParent` set and `checkVisibility()` true. A "visible" filter on height and `offsetParent` keeps them all, and they read as items sitting below the footer. Test the container's height, not the item's. An unchanged count across a state change (open vs closed) is the tell.

**Hidden screens and tabs measure zero, silently.**
An inactive tab, artboard screen or modal is `display: none`, and every rect inside it is zero. Activate it immediately before measuring, and have the probe assert one known non-zero dimension first so the failure is loud.

**A rule that matches can still lose the cascade.**
A library selector with higher specificity, or a utility class with `!important`, beats your rule, so `display: none` computes as `table-cell` and an inline `el.style.display = 'none'` changes nothing. Assert on the computed value, not on the rule being present. Hide with `el.style.setProperty('display', 'none', 'important')` when a candidate must win.

**Print a selector in full before counting its specificity.**
A grep that cuts off the start of a compound selector makes it look weaker than it is, and an override written to tie it loses. When an unexplained computed value appears, walk `document.styleSheets` (recursing into `@media`, with `try`/`catch` for cross-origin sheets) and print every rule the element `matches()` that declares the property.

**`getComputedStyle` cannot give a `:hover` value.**
Read hover rules from the stylesheet (`rule.style.getPropertyValue`) instead.

**A component's wrapper and its text compute differently.**
The outer box and the inner text element of one component can have different font size and weight. Comparing the box on one page with the text on another invents a drift. Measure the same element on both.

**A component's ground may sit on an ancestor.**
In many input components the input element and its outline read transparent while a wrapper paints the fill. Walk the ancestors before writing "transparent". In MudBlazor the ground is on `.mud-input` *(framework-specific)*.

**`svg.className` is not a string.**
It is an `SVGAnimatedString`, so string methods throw and can kill the whole probe at the first icon. Use `getAttribute('class')` for anything that might be SVG.

**Count lines by line boxes, not by distinct tops or height ÷ line height.**
Items of different heights on one line have different tops, and a single-line pill can be taller than a guessed line height. Group children whose vertical extents overlap, or count distinct rows in a `Range`'s `getClientRects()`.

**Compare like with like.**
A label in the probe output is an assumption: comparing the app's text offset with the design's icon offset reads as a large defect that is nothing. Print raw offsets and do the arithmetic where it can be checked. A row's height is arithmetic: print padding, border, content and line-height separately, not the total.

**Use one probe for both sides.**
Two probes measuring "the same thing" on the design and on the app compare different properties. Write one probe that picks the design's selector or falls back to the app's, and run it on both. A drift between two users of one component is only a finding if one probe saw both.

**When two measurements disagree, suspect the property neither looked at.**
Two itemised comparisons can both be right and still disagree because the decisive property (often `line-height`) was on neither list. Re-running one of them proves nothing.

**Match what the code renders, not how a document describes it.**
Labels, masks and spellings in the code often differ from the brief: a mask built with U+2022 BULLET, not `*`; the same term spelled two ways in two files; a status label produced by a helper. Read the string from the code or the DOM before writing a regex or a text match.

**Check a selector against the real DOM before believing "none".**
Similar components in one library render different classes (a data grid's sort header is not a simple table's; a menu item may not render the list-item class; a stack component may render no class of its own). A probe written against the wrong one reports "missing" everywhere. Dump the element's `outerHTML` once and pick from that.

**Run a known-good control in the same probe.**
Include one instance that is known to work. A check that fails identically on the thing that already worked is measuring itself.

**Read the whole column, not row 1, and a surface where the value exists.**
A check that reads only the first row may find a cell that does not hold the value type at all, and pass without having run. Read every row, on a surface where the value is guaranteed.

**A grid with no rows proves nothing.**
Widths, clipping and responsive column tiers depend on content. Measure a populated list. Expandable rows often hold several conditional blocks: pick rows by their own text so each kind is expanded once.

**Check a probe's output count against the page's own count.**
Probes and image runs often cap how many instances they report. Compare the printed count with the total before trusting a sweep.

**A page-level probe while a dialog is open measures the page under it too.**
Scope dialog probes to the dialog element, and say when a dialog is pictured over a different page than before.

**A repeated option is not an extra option.**
Read the labels, not the count.

**Probe a broken image by `naturalWidth`, not `complete`.**
An image that fails to decode (an SVG with `--` inside an XML comment, for instance) reports `complete === true`, paints nothing, logs nothing and returns 200. `naturalWidth === 0` finds it; parsing hand-written SVG before shipping prevents it.

**Measure a font's glyph coverage before relying on it.**
A face that lacks the needed digits or script falls back silently. Measure the same string's width in the intended face and in the fallback; a fallback shows as a different width, not as an error.

**Measure states the data cannot produce by building them.**
Empty states, error states and rare variants are unreachable from healthy data. Build the subtree in the page and read its computed styles, stamping the page's own scoped-CSS attribute on it (`b-xxxxx` in Blazor, `data-v-xxxx` in Vue) since that attribute is what decides whether a scoped rule applies. To learn what a library paints for a variant, append that component's markup off-screen and read it.

**Make an empty or inactive state from the real response.**
Intercept the list request, fetch the real response, rewrite arrays to `[]` (or flip one flag) and fulfil with that body: the page renders its genuine state with no write. The rewrite reaches every page that calls that endpoint, so register it only around the steps that need it, and declare it as an aid on every image it touches.

**A contrast reading on a disabled control is meaningless.**
Disabled controls are deliberately low-contrast. Print `disabled` beside every colour reading and take colours from an enabled instance. *Handled by ui_capture.py* for its own contrast check, which skips disabled controls.

**A sort that returns the same page both ways may be unwired, or the values may be equal.**
An unknown sort key often falls back to the default order without error. Compare ascending and descending results, not the arrow icon; when every value is equal, the evidence is the request's query string.

**Probe code run through the driver's evaluate call is exempt from the page's CSP.**
CDP's `Runtime.evaluate` (and Playwright's `evaluate`) lets `eval` run even where the page's `script-src` forbids it, so a CSP check driven from it passes falsely. Run the code under test as a page task (`setTimeout(…, 0)`) and prove the CSP is live with a probe in page script (`try { (0, eval)('1') } catch`). This applies to `probe_js` in ui_capture.py too.

**Some structured return values arrive empty.**
Deserialising an evaluate result into a dictionary type can silently give an empty one, which reads as "the probe found nothing". Return one joined string or a JSON string.

## 5. Interacting

**Click the real control, not a zero-size wrapper.**
A click aimed at a `display: contents` wrapper goes to the page's top-left corner, the click is delivered to the wrong element, and the menu or dialog under test simply does not open. Target the `<button>` inside. *Handled by ui_capture.py*, which refuses to click an element without a box.

**Diagnose a click that did nothing with rect, display and `elementFromPoint` together.**
That triple separates a zero-size target, something covering it, and a disabled control. Pair it with a control on the same page, clicked the same way, whose effect is unmistakable and does not navigate (an empty submit showing validation messages); without it, "the component did not react" and "clicks are not reaching the app" look the same.

**Commit bound values the way a user does.**
A filled field followed by a click elsewhere may leave the value uncommitted when the binding updates on change or blur, and validation that works then reports no error. Type with keyboard events and leave the field with Tab. *Handled by ui_capture.py* for sign-in steps. MudBlazor text fields bind on change by default *(framework-specific)*.

**Park the pointer after any click that lands on the page you measure.**
A pointer left over a control paints its hover colour into the reading and the image. A colour that differs only between runs is the sign. *Handled by ui_capture.py* (moves the mouse to a corner after each navigation and sign-in).

**Do not assume Escape closes a popover.**
Some components do not bind Escape, and a wait for the popover to close then times out, which reads as a hung page. Close it by clicking its overlay, then a point well clear of it, then the activator again, and print a warning if all three fail; one unclosed menu silently poisons every later step. In MudBlazor 9, Escape does not close `MudMenu` *(framework-specific)*. Close dialogs by their cancel button, matching every cancel label the app uses.

**Wait for a popover by its open state and pick items by text.**
Library classes for menu items vary between versions; wait on the open popover and select items by their visible text.

**Match buttons by label, not position.**
The first button in a card can be a disabled or unrelated control (a checkbox, an alternative sign-in method), and clicking it times out or selects instead of expanding.

**A disabled control can still be exercised, with care.**
To test logic behind a control that ships disabled, remove the `disabled` attribute in the DOM; frameworks that only rewrite changed attributes keep the handlers attached. This does not test disabled styling, and a re-render (a key change) restores the attribute, so remove it again between steps.

**Never disable the write guard, and never trust a form's validation to stop a save.**
Many forms fire their save from a plain click handler and post whatever is bound, leaving validation to the server, so a probe that presses Save on an empty form creates real rows. "No validation summary appeared" does not mean validation passed. Register the guard before any click that could save. *Handled by ui_capture.py* (only GET, HEAD and OPTIONS pass unless `allow_requests` names a pattern).

**Read what a form sends without sending it.**
To check what the client would submit (export columns, a request body), intercept the request, read its body, then abort it. Nothing is written and the guard still records it as blocked.

**Wait longer than the slowest round trip before leaving a page that saves on click.**
Navigating away mid-save aborts the request: the control looks changed, the server never stored it. Count the requests in the server log, not just the outcome on screen.

## 6. Pictures

**An element screenshot scrolls its target into view under any sticky chrome.**
A sticky header or tab strip ends up over the target and the image shows the navigation. Hide the page's own sticky chrome before element shots, and discard a contaminated capture as a harness fault, never as a finding. Hiding chrome by a broad class can also hide things you want (a footer that shares the app-bar class).

**An element shot is only as wide as its selector.**
A frame or box drawn by the parent is missing from a shot of the child. Shoot the parent or the page before recording an absence.

**A finding about a background or overlap needs content behind it.**
At a scroll position where nothing sits behind a bar, a transparent bar and an opaque one look the same. Use `elementsFromPoint` to find an offset where content is behind it.

**A shot can show only one scroll position; prove "reachable" with figures.**
Scroll the container to its end, compare the last content rect with any fixed bar's top, and `elementFromPoint` the last control. A blank shot can be a real defect (content above an unreachable scroll origin): check before calling it an artefact.

**Make both sides comparable, and declare every aid.**
A design capped at one width and an app at another do not line up. Lifting the cap, hiding banners, disabling animations or feeding mock data is legitimate only if it is stated with the image. *Handled by ui_capture.py* for its own aids (listed in the output), but your `hide` entries and mock data are yours to declare.

**Inject exactly what the change will write.**
A hand-written imitation of a component parameter is not the change: an override of a library's spacing arithmetic gets the margins wrong, and a class that sets `position: sticky` without what the parameter also sets (an `overflow` on the container) does not stick. Inject the class or attribute the parameter renders, and check what else the parameter changes. If you can only approximate, say so.

**Keep the injected candidate, so "exactly what was pictured" can be checked.**
Save the candidate CSS and JS with the output. A candidate can carry changes nobody discussed; once a person rules on a picture, the candidate is the spec, so re-measure the shipped result against the candidate's figures.

**A probe that restores state can undo the candidate before the shot.**
If the probe runs between the candidate and the screenshot and puts back what it touched (scroll position, an open panel), the shot shows the original state. Shoot state-setting candidates with a probe that changes nothing.

**Re-test a fix at the width the defect was found at.**
A candidate that leaves that width byte-identical can overturn the diagnosis, not just the fix (everything was already at minimum width). *Handled by ui_capture.py*: `compare` pictures the issue's own width, and its `regression` list reports `still` where the fix does not work and `new` where it breaks another width.

**Measure a `color-mix` before claiming it matches.**
Mixing a colour toward white raises lightness and strips chroma, so "the same colour, lighter" is often visibly not the colour asked for. Read the computed value back and compare numbers.

**Read pixels, not the image.**
An image as displayed (scaled, in a viewer, in a contact sheet) can mislead about tone. When a picture suggests a colour problem, sample the pixel values or read the computed style.

**Capture element shots per width, not at the end.**
A driver that takes element shots after a multi-width loop takes them all at the last width, labelled as others. Capture inside the loop, or order widths so the last is the one you shoot.

**Headless browsers may hide scrollbars.**
With hidden scrollbars every bar measures 0 px thick, so "the scrollbar disappeared" can be neither confirmed nor refuted by thickness. Judge scrollability by `scrollWidth > clientWidth` and by scrolling to the end (negative `scrollLeft` under RTL); relaunch without `--hide-scrollbars` when the image must show the bar.

**A design artboard at a narrow width is not a design statement.**
A mock that does not reflow measures absurdly narrow at phone widths. Compare the app's narrow figures against the design's `@media` rules instead, and say so.

**Read a drawn design's geometry from the SVG, not by counting pixels.**
Scale = rendered width ÷ `viewBox` width; then compute diameters, stroke widths and ratios from the authored attributes. The ratio (stroke to ring, hole to outer) is what the eye reads, and a screenshot cannot give it.

**After a change to shared chrome, open every instance, not just the pictured ones.**
A frame rule reaches dialogs and pages nobody pictured. Run the same probe over all of them and diff the figures against the earlier run.

**Charting library options can be accepted and do nothing** *(framework-specific: ApexCharts)*.
A donut's resting centre caption is styled by the `total` label options, not `name`; `grid.padding` does not resize a pie; `grid.show: false` leaves gridlines unless the axis lines are turned off too; `tickAmount` on a category axis picks evenly spaced indices, not the ends; a stylesheet with `!important` on chart text beats the inline `fontFamily` the library writes. For a live candidate, call `ApexCharts.exec(id, 'updateOptions', …)` with the wrapper's id, not the canvas id. Read the rendered result, not the option you set.

## 7. State-changing walks

**Drive a control to a stated value; never toggle it.**
A toggle assumes a baseline, and a previous run that crashed before restoring leaves the opposite one, so every step tests the reverse of its heading and still passes. Read the current state, click only if it differs, and print both.

**Capture the baseline at the start, including whether a record exists.**
Restore to the captured values, not hard-coded ones. Record whether a stored row existed, not only what the screen showed: "no override" and "an override holding the default" look the same on screen and differ in the store.

**Restore through the app's own "write the default" path.**
Use the path the app uses to clear a single setting, not a global "reset all", which wipes settings the walk never touched. If the change under test moves a default, the old baseline is no longer a valid restore target: restore to the new default or delete the override, and say which.

**Verify a restore after a cold navigation, and against the store.**
Re-read after navigating fresh and print `RESTORE OK` or both readings. The screen can hide a wrong state (a pager that widens to show any size), so check the database or API before and after a state-changing walk. Expect audit stamps to move; say so in the report.

**Prefer a fulfilled response to a seeded row.**
Mock the response in the browser for data the dev database lacks; seeding rows and deleting them is a write with clean-up risk. If you must seed, mark the rows clearly and remove them through the app's own delete.

## 8. Records

**Record which tree was measured.**
A dev server serves the working tree, maybe with uncommitted edits. If the source changes between the run and the commit, the figures describe a tree that exists nowhere, even though nothing in the run was wrong. When figures will be recorded as a claim about what shipped, re-read strings, counts and selectors from the commit (`git show <commit>:<path>`), or run `git diff --stat` over their source files just before committing and re-measure anything listed. Naming the tree in a heading is not enough if nobody acts on it.

**Prefer figures that can be re-derived.**
A count, a string, a class name or a width can be re-checked months later from the commit; "it looked right" cannot.

**When a record and the code disagree, date the files first.**
Compare the source files' modification times with the run and the commit, using an untouched file in the same folder as a control (if its time is old, no checkout rewrote the timestamps). Intermediate states that were never staged are in no commit.

**Normalise before diffing two runs.**
A byte-order mark on the first line or CRLF against LF makes every line differ. Strip both before `diff`.

**Write output to an absolute path, and check for strays.**
A run started from the wrong directory can fail ("no project found") and drop its relative-path output somewhere else, so the expected file is an older run's. Redirect to an absolute path, and look for stray files before committing.

## 9. Shell and encoding traps

**Git Bash rewrites arguments that look like paths** *(Git Bash / MSYS)*.
A route argument such as `/Orders/Create` becomes `C:/Program Files/Git/Orders/Create` before the program sees it, so every page reads as broken. `export MSYS_NO_PATHCONV=1` before the run, or pass routes without the leading slash.

**Never pipe a driver's output through something that closes the pipe.**
`… | head -60` closes the pipe, the driver dies of SIGPIPE partway through, and the partial file can end at a tidy boundary that looks complete. Redirect to a file (`> out.txt 2>&1`) and read it afterwards.

**`tail` over several files can exit non-zero after a good run** *(Git Bash)*.
Read files one at a time, or check the driver's own last line rather than a tool's exit code.

**Arguments after `dotnet run` need a `--` separator** *(.NET)*.
Without it the program's arguments are swallowed and it silently runs its default mode.

**Windows PowerShell 5.1 reads a BOM-less UTF-8 script as ANSI** *(Windows PowerShell 5.1)*.
Non-ASCII text (non-Latin selectors, an em dash in a message) is mangled, so selectors time out or the script fails to parse. Keep scripts ASCII, build non-ASCII strings from `[char]` code points, use class selectors in generated commands, or save with a BOM. Its `Out-File` and `>` may also add a BOM to files other tools read.

**PowerShell aliases outrank functions of the same name** *(PowerShell)*.
A helper called `Cp` is shadowed by the `cp` alias. Name helpers so they collide with nothing.

**PowerShell variables are case-insensitive** *(PowerShell)*.
`$W` and `$w` are the same variable, and one silently overwrites the other.

**A `DataTable` returned from a PowerShell function unrolls into its rows** *(PowerShell)*.
`(Query …).Rows` then iterates nothing; iterate the result directly.

**`Invoke-WebRequest -SkipCertificateCheck` does not exist in Windows PowerShell 5.1** *(Windows PowerShell 5.1)*.
Probing a dev HTTPS endpoint with it makes a healthy server look dead. Use `curl -k`.

**`pkill -f` from Git Bash may not stop a Windows process** *(Windows)*.
The restart then fails with "address already in use", which reads as a conflict with something else. Stop the process by the port it listens on (`Get-NetTCPConnection -LocalPort <port> -State Listen` → `Stop-Process`).

**Format numbers with the invariant culture** *(.NET)*.
A driver running under a locale with a different decimal separator prints `2/3s` or `2,3s` for 2.3 seconds, which looks like a broken probe.

**A worktree for the "before" state needs a short, plain path.**
Paths containing `#` or spaces break some build tools. Create the worktree at a short path, stop your dev server and run the worktree's on the same port, since CORS may admit only that one.
