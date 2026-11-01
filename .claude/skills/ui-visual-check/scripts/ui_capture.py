#!/usr/bin/env python3
"""Survey a running web UI at standard screen sizes, then picture each issue before and after its fix.

Shared by the /detect UI review and the /ui-visual-check skill; the copy in detect/scripts/ is the source of truth.

The browser is any installed Chrome, Edge or Chromium, driven headless over the DevTools protocol
(scripts/cdp.py, standard library only). The application must already be running: pass its URL in the
plan. This script never starts, builds or changes the project, and it blocks every request that could
write data (anything other than GET/HEAD/OPTIONS) unless the plan allows it by pattern, e.g. a sign-in POST.

  ui_capture.py check                                   which browser will be used, and whether it starts
  ui_capture.py viewports [standard|deep]               the screen sizes of a preset
  ui_capture.py survey  <plan.json> --out <dir>         every route at every viewport: a full-page image + DOM probe figures
  ui_capture.py compare <plan.json> --out <dir>         every planned issue: before image, fix injected live, after image,
                                                        before/after figures and a regression sweep at the other viewports
  ui_capture.py diff <before/survey.json> <after/survey.json> [--json]
                                                        compare two surveys of the same plan (before and after a code
                                                        change): issue counts per route × width, what got better, what
                                                        got worse, and the image pairs to look at

Common options: --format webp|png|jpeg (default webp) · --quality N (default 80) · --max-height PX (survey, default 4000)
                --browser PATH · --only ID[,ID] (compare) · --timeout S (per navigation, default 45)

Plan (JSON; secrets come only from environment variables and are never written out):
  {
    "base_url": "http://localhost:5173",       or a folder of static pages relative to the plan file
    "viewports": "standard" | "deep" | [{"label": "phone", "w": 360, "h": 800, "mobile": true}, ...],
    "themes": ["light"],                      optional; "dark" emulates prefers-color-scheme: dark
    "ready": "main",                          selector that exists only once a page has loaded (not in its skeleton)
    "routes": [{"path": "/", "name": "Home", "ready": "...", "setup_js": "...", "probe_js": "..."}],
                                              setup_js: statements run after load, before the probe (open a menu)
                                              probe_js: survey only; an expression evaluated after the built-in probe that
                                              returns a JSON string (or any JSON value), stored in the cell as "custom";
                                              a script error is stored as "custom_error" and the cell is still kept
    "allow_requests": ["POST */api/auth/login"],   METHOD + glob on the URL; everything else that writes is blocked
    "auth": {"steps": [{"goto": "/login"}, {"fill": "#email", "env": "DETECT_UI_USER"},
                       {"fill": "#password", "env": "DETECT_UI_PASSWORD"}, {"click": "button[type=submit]"}, {"wait": "nav"}]},
    "headers_env": {"Authorization": "DETECT_UI_AUTH"},   extra request headers read from environment variables
    "hide": [".cookie-banner"],               hidden in every image; declared as a rendering aid
    "map_localhost": false,                   resolve localhost to 127.0.0.1 inside the browser (IPv6 loopback blocked)
    "issues": [{                              compare mode only
      "id": "UI-001", "route": "/orders", "viewport": "phone" | {"w": 360, "h": 800}, "theme": "light",
      "selector": ".orders-table", "shot": "region" | "element" | "viewport", "pad": 24,
      "setup_js": "...",                      runs before the before-image (open a menu, scroll a list)
      "fix_css": ".orders-table{display:block;overflow-x:auto}",
      "fix_js": "(on) => { ... }",            called with true to apply and false to undo (class swaps, attributes)
      "design": {"url": "file:///.../mock.html#orders", "selector": ".orders"},   optional third image
      "regress": true,                        re-probe every other viewport with the fix applied
      "must_be_visible": ["#startMenu"],      optional; after the fix each selector must be on the visible screen
                                              (window.visualViewport, not clipped, not covered), else resolved=no
      "judge_kinds": ["h_overflow", "offscreen_control"]   optional; only these kinds decide the verdict, the
                                              others' changes are listed as information (judgement.info)
    }]
  }
  An issue's id is burned into its images: make it final before compare (renumbering means re-running compare).

Verdict (compare.json issues[].resolved / judgement): yes · no · unmeasured. judgement.reason is English text;
reason_code (not_visible, adds_issues, revealed_worse, improved, no_difference) and reason_args carry the same
facts for translated reports (judge()'s docstring lists the args). Issues on elements the before state did not show
(a window the fix opens) go to judgement.revealed / info, unless the element got worse than its own state before the
fix (smaller font, lower contrast, smaller target, a more scaled or newly broken image): those are judgement.worsened
and count like new issues.

Outputs (in --out): survey.json + survey/<route>@<w>x<h>[-dark].<fmt>; compare.json + <ID>-before.<fmt>, <ID>-after.<fmt>
[, <ID>-design.<fmt>]. Image paths in the JSON are relative to --out's parent when --out ends in .detect/visual, so they
can be copied into /detect's findings.json as they are (".detect/visual/UI-001-before.webp").
"""
from __future__ import annotations

import base64
import fnmatch
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp import Browser, CDPError, Page, find_browser  # noqa: E402

PROBES = (Path(__file__).resolve().parent / "ui_probes.js").read_text(encoding="utf-8")

PRESETS = {
    "standard": [
        {"label": "phone", "w": 360, "h": 800, "mobile": True},
        {"label": "phone-l", "w": 390, "h": 844, "mobile": True},
        {"label": "tablet", "w": 768, "h": 1024, "mobile": True},
        {"label": "tablet-l", "w": 1024, "h": 768, "mobile": True},
        {"label": "laptop", "w": 1280, "h": 800, "mobile": False},
        {"label": "desktop", "w": 1440, "h": 900, "mobile": False},
        {"label": "desktop-l", "w": 1920, "h": 1080, "mobile": False},
    ],
}
PRESETS["deep"] = [{"label": "phone-s", "w": 320, "h": 568, "mobile": True}] + PRESETS["standard"][:2] + \
    [{"label": "phone-xl", "w": 412, "h": 915, "mobile": True}] + PRESETS["standard"][2:] + [{"label": "qhd", "w": 2560, "h": 1440, "mobile": False}]

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
NO_MOTION = ("*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;"
             "caret-color:transparent!important;scroll-behavior:auto!important}")


def viewports_of(plan) -> list[dict]:
    v = plan.get("viewports", "standard")
    out = PRESETS[v] if isinstance(v, str) else v
    for x in out:
        x.setdefault("label", f"{x['w']}x{x['h']}")
        x.setdefault("mobile", x["w"] < 1024)
    return out


LATIN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

# The painted part of an element: its box cut by every clipping ancestor up to a fixed box (shared by the two below).
_PAINTED_JS = """
  const __cs = (e) => getComputedStyle(e);
  const __painted = (el, scrollers) => {
    const r = el.getBoundingClientRect();
    let L = r.left, T = r.top, R = r.right, B = r.bottom, fixed = __cs(el).position === "fixed", by = null;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = __cs(a);
      if (+as.opacity === 0) return { L, T, R: L, B: T, fixed, by: a };
      if (as.overflowX !== "visible" || as.overflowY !== "visible") {
        if (!(scrollers && /(auto|scroll)/.test(as.overflowX + as.overflowY) && (a.scrollWidth > a.clientWidth + 1 || a.scrollHeight > a.clientHeight + 1))) {
          const ar = a.getBoundingClientRect();
          if (ar.left > L || ar.top > T || ar.right < R || ar.bottom < B) by = by || a;
          L = Math.max(L, ar.left); T = Math.max(T, ar.top); R = Math.min(R, ar.right); B = Math.min(B, ar.bottom);
        }
      }
      if (as.position === "fixed") { fixed = true; if (as.transform === "none") break; }
    }
    return { L, T, R, B, fixed, by };
  };
"""

# Item 11 (element identity): the elements a user could see in the BEFORE state, kept in the page across the fix.
# An after-state issue on an element outside this set was revealed by the fix (a window brought on screen), not made by it.
# Every element NOT seen that has own text, is interactive or is an image also gets a baseline of its own facts
# (window.__detectIntrinsic: font px, contrast, target size, image scaling), so REVEALED_JS can tell content that was
# merely hidden from content the fix made worse.
SEEN_JS = "(() => {" + _PAINTED_JS + """
  const seen = new WeakSet(), base = new WeakMap(), W = document.documentElement.scrollWidth, H = document.documentElement.scrollHeight;
  const isSeen = (el) => {
    const r = el.getBoundingClientRect(), s = __cs(el);
    if (r.width < 1 || r.height < 1 || s.visibility !== "visible" || +s.opacity === 0) return false;
    const p = __painted(el, true);  // content a scroller can bring into view counts as seen
    if (p.R - p.L < 1 || p.B - p.T < 1) return false;
    const x0 = p.fixed ? 0 : -scrollX, y0 = p.fixed ? 0 : -scrollY, x1 = p.fixed ? innerWidth : W - scrollX, y1 = p.fixed ? innerHeight : H - scrollY;
    return p.R > x0 && p.L < x1 && p.B > y0 && p.T < y1;
  };
  let reuse = false;
  for (const el of document.body.querySelectorAll("*")) {
    if (isSeen(el)) { seen.add(el); continue; }
    if (el.closest("script,style,noscript,template,.__detect") || !window.__detectIntrinsic) continue;
    const b = window.__detectIntrinsic(el, reuse);
    reuse = true;
    if (b) base.set(el, b);
  }
  window.__detectSeen = seen;
  window.__detectBaseline = base;
  return true;
})()"""

# Item 9: a plan issue's `must_be_visible` selectors, checked on screen as a phone shows it (window.visualViewport: a
# mobile browser widens its layout to fit overflowing content, so the layout width can contain a control the user
# cannot see). Visible = rendered, not clipped by an ancestor (a control that must be scrolled into view inside a bar
# is not visible), horizontally inside the visual viewport, vertically too when it sits in a fixed box (a page scroll
# cannot bring that one into view), and not covered at its centre.
VISIBLE_JS = "((sels) => {" + _PAINTED_JS + """
  const v = window.visualViewport, VL = v ? v.offsetLeft : 0, VT = v ? v.offsetTop : 0;
  const VR = VL + (v ? v.width : innerWidth), VB = VT + (v ? v.height : innerHeight), r1 = (n) => Math.round(n);
  const name = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : e.classList[0] ? "." + e.classList[0] : "");
  const no = (code, reason, args) => ({ visible: false, code, args: args || {}, reason });
  const one = (el) => {  // null when visible, else {visible: false, code, args, reason} (reason: the English text)
    const r = el.getBoundingClientRect(), s = __cs(el);
    if (el.closest("[hidden]") || r.width < 1 || r.height < 1) return no("not_rendered", "not rendered");
    if (s.visibility !== "visible") return no("hidden_visibility", "hidden (visibility)");
    if (+s.opacity === 0) return no("hidden_opacity", "hidden (opacity)");
    const p = __painted(el, false);
    if (p.R - p.L < r.width - 1 || p.B - p.T < r.height - 1) {
      const by = p.by ? name(p.by) : "", painted = [r1(Math.max(0, p.R - p.L)), r1(Math.max(0, p.B - p.T))], size = [r1(r.width), r1(r.height)];
      return no("clipped", `clipped by ${by || "an ancestor"} (painted ${painted[0]}x${painted[1]} of ${size[0]}x${size[1]})`, { by, painted, size });
    }
    if (r.left < VL - 1 || r.right > VR + 1)
      return no("off_screen_x", `off screen: x ${r1(r.left)}…${r1(r.right)}, visible ${r1(VL)}…${r1(VR)}`, { from: r1(r.left), to: r1(r.right), vis_from: r1(VL), vis_to: r1(VR) });
    if (p.fixed && (r.top < VT - 1 || r.bottom > VB + 1))
      return no("off_screen_y", `off screen: y ${r1(r.top)}…${r1(r.bottom)}, visible ${r1(VT)}…${r1(VB)}`, { from: r1(r.top), to: r1(r.bottom), vis_from: r1(VT), vis_to: r1(VB) });
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    if (cy >= 0 && cy < innerHeight && cx >= 0 && cx < innerWidth) {
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !hit.closest(".__detect"))
        return no("covered", "covered by " + name(hit), { by: name(hit) });
    }
    return null;
  };
  const out = {};
  for (const sel of sels) {
    let els = [];
    try { els = [...document.querySelectorAll(sel)]; } catch (e) { out[sel] = no("bad_selector", "bad selector"); continue; }
    if (!els.length) { out[sel] = no("no_match", "no element matches"); continue; }
    const why = els.map(one);  // one visible match is enough (a phone and a desktop copy of the same control)
    out[sel] = why.includes(null) ? { visible: true } : why[0];
  }
  return JSON.stringify(out);
})"""

# Item 11: which after-state issues sit on elements the before state did not show (needs SEEN_JS run before the fix).
# Only kinds that belong to the element itself are excused that way; where an element ends up (overflow, off screen,
# overlap, covered, clipped) is exactly what a fix changes, so those count even on newly shown elements.
# A revealed issue is also compared with its element's baseline: when the element got worse (font smaller by >= 0.5 px,
# contrast lower by >= 0.05, target's smaller side smaller by >= 1 px, image upscale higher by >= 0.05 or distortion by
# >= 0.02, or newly broken) it is `worsened` and is not excused. Target size and image scaling are compared only when
# the element had a box before (off screen or scrolled away); without one they stay information.
INTRINSIC_KINDS = {"low_contrast", "small_text", "small_target", "img_broken", "img_upscaled", "img_distorted"}
REVEALED_JS = """((issues) => {
  const seen = window.__detectSeen, base = window.__detectBaseline, out = { revealed: {}, worsened: {}, elements: [] };
  if (!seen) return JSON.stringify(out);
  const METRIC = { small_text: ["font_px", (b, a) => b - a >= 0.5], low_contrast: ["contrast", (b, a) => b - a >= 0.05],
    small_target: ["target_px", (b, a) => b - a >= 1], img_upscaled: ["upscale", (b, a) => a - b >= 0.05],
    img_distorted: ["distortion", (b, a) => a - b >= 0.02], img_broken: ["broken", (b, a) => b === 0 && a === 1] };
  let reuse = false;
  for (const it of issues) {
    if (!it.sel) continue;
    let els = [];
    try { els = [...document.querySelectorAll(it.sel)]; } catch (e) { continue; }
    if (!els.length || els.some((e) => seen.has(e))) continue;
    out.revealed[it.kind] = (out.revealed[it.kind] || 0) + 1;
    const m = METRIC[it.kind];
    if (!m || !base || !window.__detectIntrinsic) continue;
    for (const el of els) {
      const b = base.get(el);
      if (!b || b[m[0]] == null) continue;
      const a = window.__detectIntrinsic(el, reuse);
      reuse = true;
      if (!a || a[m[0]] == null || !m[1](b[m[0]], a[m[0]])) continue;
      out.worsened[it.kind] = (out.worsened[it.kind] || 0) + 1;
      out.elements.push({ kind: it.kind, sel: it.sel, metric: m[0], before: b[m[0]], after: a[m[0]] });
      break;
    }
  }
  return JSON.stringify(out);
})"""


def slug(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s or "root"


class Session:
    """One tab for the whole run: sign in once and resize the same page, so a rate-limited sign-in is not repeated
    and an in-memory session survives."""

    def __init__(self, plan: dict, args: dict):
        self.plan, self.args = plan, args
        self.timeout = float(args.get("timeout", 45))
        self.browser = Browser(args.get("browser"), map_localhost=bool(plan.get("map_localhost"))).start()
        self.page: Page = self.browser.new_page()
        self.blocked, self.bad, self.errors, self.inflight = [], [], [], {}
        self.allow = [(a.split(" ", 1) + ["*"])[:2] if " " in a else ["*", a] for a in plan.get("allow_requests", [])]
        p = self.page
        p.on("Fetch.requestPaused", self._paused)
        p.on("Network.requestWillBeSent", lambda e: self.inflight.__setitem__(e["requestId"], time.monotonic()))
        p.on("Network.loadingFinished", lambda e: self.inflight.pop(e["requestId"], None))
        p.on("Network.loadingFailed", lambda e: self.inflight.pop(e["requestId"], None))
        p.on("Network.responseReceived", self._response)
        p.on("Runtime.exceptionThrown", lambda e: self._err("exception", (e.get("exceptionDetails", {}).get("exception", {}) or {}).get("description") or e.get("exceptionDetails", {}).get("text", "")))
        p.on("Log.entryAdded", lambda e: e["entry"].get("level") == "error" and self._err("console", e["entry"].get("text", "")))
        p.on("Page.javascriptDialogOpening", lambda e: p.send_nowait("Page.handleJavaScriptDialog", {"accept": False}))
        self.loads = 0  # Page.loadEventFired count (navigate() waits for it to change)
        p.on("Page.loadEventFired", lambda e: setattr(self, "loads", self.loads + 1))
        for dom in ("Page.enable", "Network.enable", "Runtime.enable", "Log.enable"):
            p.send(dom)
        p.send("Fetch.enable", {"patterns": [{"urlPattern": "*", "requestStage": "Request"}]})
        headers = {k: os.environ[v] for k, v in (plan.get("headers_env") or {}).items() if os.environ.get(v)}
        if headers:
            p.send("Network.setExtraHTTPHeaders", {"headers": headers})
        p.send("Page.addScriptToEvaluateOnNewDocument", {"source": PROBES})
        self.vp = None
        self.theme = None
        self.signed_in = False

    # -- request guard ----------------------------------------------------------------------
    def _paused(self, e):
        req = e["request"]
        method, url = req.get("method", "GET").upper(), req.get("url", "")
        ok = method in SAFE_METHODS or url.startswith(("data:", "blob:")) or any(
            (m == "*" or m.upper() == method) and fnmatch.fnmatch(url, pat) for m, pat in self.allow)
        if ok:
            self.page.send_nowait("Fetch.continueRequest", {"requestId": e["requestId"]})
        else:
            self.blocked.append(f"{method} {url.split('?')[0]}")
            self.page.send_nowait("Fetch.failRequest", {"requestId": e["requestId"], "errorReason": "BlockedByClient"})

    def _response(self, e):
        r = e.get("response", {})
        if r.get("status", 0) >= 400:
            self.bad.append(f"{r['status']} {r.get('url', '').split('?')[0]}")

    def _err(self, kind, text):
        if text:
            self.errors.append(f"{kind}: {text.splitlines()[0][:300]}")

    # -- page control -------------------------------------------------------------------------
    def set_viewport(self, vp: dict, theme: str = "light"):
        if self.vp != (vp["w"], vp["h"], vp["mobile"]):
            self.page.send("Emulation.setDeviceMetricsOverride", {"width": vp["w"], "height": vp["h"], "deviceScaleFactor": 1,
                                                                   "mobile": bool(vp["mobile"]), "screenWidth": vp["w"], "screenHeight": vp["h"]})
            self.page.send("Emulation.setTouchEmulationEnabled", {"enabled": bool(vp["mobile"]), "maxTouchPoints": 5 if vp["mobile"] else 1})
            self.vp = (vp["w"], vp["h"], vp["mobile"])
        if self.theme != theme:
            self.page.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-color-scheme", "value": theme},
                                                                        {"name": "prefers-reduced-motion", "value": "reduce"}]})
            self.theme = theme

    def url_of(self, path: str) -> str:
        if re.match(r"^[a-z]+:", path):
            return path
        return self.plan["base_url"].rstrip("/") + "/" + path.lstrip("/")

    def wait_ready(self, ready: str | None):
        p, end = self.page, time.monotonic() + self.timeout
        while time.monotonic() < end:
            try:
                st = p.eval("document.readyState", timeout=10)
            except CDPError:
                st = None
            if st == "complete":
                break
            p.idle(0.2)
        if ready:  # a selector that exists only in the loaded state, waited for as VISIBLE (a skeleton may hold a hidden copy)
            js = f"(() => {{ const e = document.querySelector({json.dumps(ready)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); }})()"
            while time.monotonic() < end:
                if p.eval(js, timeout=10):
                    break
                p.idle(0.25)
            else:
                raise CDPError(f"ready selector {ready!r} never became visible")
        quiet_since = time.monotonic()
        while time.monotonic() < end:  # network quiet for 500 ms (long-lived requests older than 10 s are ignored)
            now = time.monotonic()
            busy = [t for t in self.inflight.values() if now - t < 10]
            if busy:
                quiet_since = now
            elif now - quiet_since > 0.5:
                break
            p.idle(0.1)
        p.eval("document.fonts ? document.fonts.ready.then(() => true) : true", timeout=15)
        p.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))", timeout=10)

    def prepare(self):
        """Rendering aids applied to every image: no animation, hidden noise. Re-applied after each navigation."""
        css = NO_MOTION + "".join(f"{s}{{visibility:hidden!important}}" for s in self.plan.get("hide", []))
        self.page.eval(f"(() => {{ let s = document.getElementById('__detect_aids'); if (!s) {{ s = document.createElement('style'); s.id = '__detect_aids'; document.head.appendChild(s); }} s.textContent = {json.dumps(css)}; return true; }})()")
        if not self.page.eval("typeof window.__detectProbe === 'function'"):
            self.page.eval(PROBES + ";true")

    def navigate(self, url: str, fresh: bool = True):
        """Every navigation goes through here. A hash-only change (`#tab`, or the same URL with a fragment) is a
        same-document navigation: Page.navigate returns no loaderId and no load event follows, so waiting for one
        would sit out the whole timeout. With `fresh` the document is then reloaded, because a capture assumes a new
        document (otherwise the previous issue's injected fix and marks would still be on the page)."""
        p = self.page
        seen = self.loads
        r = p.send("Page.navigate", {"url": url}, timeout=self.timeout)
        if not r.get("loaderId"):  # same-document navigation: no load event will come
            if not fresh:
                p.idle(0.2)  # let the app's hashchange handler run
                return
            seen = self.loads
            p.send("Page.reload", {"ignoreCache": False}, timeout=self.timeout)
        end = time.monotonic() + self.timeout
        while self.loads == seen and time.monotonic() < end:  # counted by a handler, so a load event that arrived
            p.idle(0.1)                                       # while Page.navigate was being answered counts too

    def goto(self, path: str, ready: str | None = None, setup_js: str | None = None):
        self.sign_in()
        p = self.page
        self.navigate(self.url_of(path))
        self.wait_ready(ready or self.plan.get("ready"))
        self.prepare()
        if setup_js:
            p.eval(f"(async () => {{ {setup_js} }})().then(() => true)", timeout=30)
            p.idle(0.3)
        self.park_mouse()

    def park_mouse(self):  # a pointer left over a control paints its hover state into the image
        self.page.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": 1, "y": 1})

    def sign_in(self):
        A = self.plan.get("auth")
        if self.signed_in or not A:
            return
        self.signed_in = True
        p = self.page
        for st in A.get("steps", []):
            if "goto" in st:  # a hash step inside the sign-in flow keeps the document (the app's state lives in it)
                self.navigate(self.url_of(st["goto"]), fresh=False)
                self.wait_ready(st.get("ready"))
            elif "fill" in st:
                value = os.environ.get(st["env"], "") if st.get("env") else st.get("value", "")
                if st.get("env") and not value:
                    raise CDPError(f"auth step needs environment variable {st['env']}")
                ok = p.eval(f"(() => {{ const e = document.querySelector({json.dumps(st['fill'])}); if (!e) return false; e.focus(); e.select && e.select(); return true; }})()")
                if not ok:
                    raise CDPError(f"auth: no field {st['fill']!r}")
                p.send("Input.insertText", {"text": value})
                p.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9})
                p.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9})
            elif "click" in st:
                self.click(st["click"])
            elif "wait" in st:
                self.wait_ready(st["wait"])
            elif "press" in st:
                p.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": st["press"]})
                p.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": st["press"]})
        self.park_mouse()

    def click(self, sel: str):
        r = self.page.eval(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; e.scrollIntoView({{block: 'center'}}); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; }})()")
        if not r or r[2] < 1:  # a display:contents wrapper has no box and a click on it lands elsewhere
            raise CDPError(f"cannot click {sel!r}: no element with a box")
        for t in ("mouseMoved", "mousePressed", "mouseReleased"):
            self.page.send("Input.dispatchMouseEvent", {"type": t, "x": r[0], "y": r[1], "button": "left", "clickCount": 1})
        self.page.idle(0.5)

    def probe(self) -> dict:
        return json.loads(self.page.eval("window.__detectProbe()", timeout=60))

    def visible(self, sels: list[str]) -> dict:
        """{selector: {visible, code?, args?, reason?}} for a plan issue's must_be_visible list, measured against
        visualViewport. A control that is not visible carries a machine-readable `code` (no_match, bad_selector,
        not_rendered, hidden_visibility, hidden_opacity, clipped, off_screen_x, off_screen_y, covered), its `args` and
        the English `reason`."""
        return json.loads(self.page.eval(f"{VISIBLE_JS}({json.dumps(sels)})"))

    def revealed(self, pr: dict) -> dict:
        """Listed issues of a probe taken after the fix whose elements the before state did not show:
        {"revealed": {kind: n}, "worsened": {kind: n}, "elements": [{kind, sel, metric, before, after}]}. `worsened`
        (a subset of `revealed`) are those whose element got worse than its own baseline taken before the fix."""
        issues = [{"kind": i["kind"], "sel": i.get("sel", "")} for i in pr.get("issues", []) if i["kind"] in INTRINSIC_KINDS]
        return json.loads(self.page.eval(f"{REVEALED_JS}({json.dumps(issues)})"))

    def target(self, sel: str) -> dict:
        return json.loads(self.page.eval(f"window.__detectTarget({json.dumps(sel)})"))

    def shoot(self, path: Path, clip: dict | None, fmt: str, quality: int) -> dict:
        params = {"format": fmt, "captureBeyondViewport": True}
        if fmt != "png":
            params["quality"] = quality
        if clip:
            params["clip"] = {**clip, "scale": 1}
        data = base64.b64decode(self.page.send("Page.captureScreenshot", params, timeout=90)["data"])
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return {"w": round(clip["width"]) if clip else None, "h": round(clip["height"]) if clip else None, "bytes": len(data)}

    def doc_size(self) -> tuple[int, int, int, int]:
        return tuple(self.page.eval("[document.documentElement.scrollWidth, document.documentElement.scrollHeight, document.documentElement.clientWidth, innerHeight]"))

    def close(self):
        try:
            self.page.close()
        finally:
            self.browser.close()


def rel_path(p: Path, out: Path) -> str:
    p, out = p.resolve(), out.resolve()  # `--out .` run inside .detect/visual has no name until it is resolved
    base = out.parent.parent if out.name == "visual" and out.parent.name == ".detect" else out
    return p.relative_to(base).as_posix()


def meta_block(s: Session, plan: dict) -> dict:
    v = s.browser.version()
    return {"tool": "ui_capture.py", "browser": v.get("Browser"),
            "date": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"), "base_url": plan.get("base_url"),
            "aids": ["animations and transitions disabled", "prefers-reduced-motion: reduce"] + [f"hidden: {h}" for h in plan.get("hide", [])],
            "write_guard": "requests other than GET/HEAD/OPTIONS blocked" + (f"; allowed: {', '.join(plan['allow_requests'])}" if plan.get("allow_requests") else "")}


def survey(plan: dict, out: Path, args: dict) -> int:
    fmt, q, max_h = args.get("format", "webp"), int(args.get("quality", 80)), int(args.get("max_height", 4000))
    s = Session(plan, args)
    res = {**meta_block(s, plan), "mode": "survey", "viewports": viewports_of(plan), "routes": plan["routes"], "cells": []}
    try:
        for route in plan["routes"]:
            for theme in plan.get("themes", ["light"]):
                for vp in viewports_of(plan):
                    n_err, n_bad, n_blk = len(s.errors), len(s.bad), len(s.blocked)
                    cell = {"route": route["path"], "name": route.get("name", route["path"]), "viewport": vp["label"], "w": vp["w"], "h": vp["h"], "theme": theme}
                    try:
                        s.set_viewport(vp, theme)
                        s.goto(route["path"], route.get("ready"), route.get("setup_js"))
                        pr = s.probe()
                        if route.get("probe_js"):
                            cell.update(custom_probe(s, route["probe_js"]))
                        dw, dh, cw, ih = s.doc_size()
                        name = f"{slug(route.get('name') or route['path'])}@{vp['w']}x{vp['h']}{'' if theme == 'light' else '-' + theme}.{fmt}"
                        img = out / "survey" / name
                        info = s.shoot(img, {"x": 0, "y": 0, "width": max(dw, cw), "height": min(dh, max_h)}, fmt, q)
                        cell.update({"shot": rel_path(img, out), "shot_size": [info["w"], info["h"]], "cut": dh > max_h, "probe": pr})
                    except CDPError as e:
                        cell["error"] = str(e)
                    cell.update({"errors": s.errors[n_err:], "bad_responses": s.bad[n_bad:], "blocked": s.blocked[n_blk:]})
                    res["cells"].append(cell)
                    k = cell.get("probe", {}).get("counts", {})
                    print(f"{cell['name']:<24} {vp['label']:<10} {theme:<5} " + (f"ERROR {cell['error']}" if "error" in cell else (" ".join(f"{a}={b}" for a, b in sorted(k.items())) or "no issues")), flush=True)
    finally:
        s.close()
    res["blocked_total"] = len(s.blocked)
    (out / "survey.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"→ {out / 'survey.json'} · {len(res['cells'])} cells · {res['blocked_total']} write requests blocked")
    return 0 if not any("error" in c for c in res["cells"]) else 1


def custom_probe(s: Session, expr: str) -> dict:
    """A route's own measurement (probe_js): {"custom": value}, or {"custom_error": message} so one bad expression does
    not cost the cell its image and built-in figures. A returned string is parsed as JSON when it is JSON."""
    try:
        v = s.page.eval(expr, timeout=30)
    except CDPError as e:
        return {"custom_error": str(e)}
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            pass
    return {"custom": v}


def region_clip(s: Session, sel: str, shot: str, pad: int, width_hint: int | None = None) -> dict:
    r = json.loads(s.page.eval(f"window.__detectClip({json.dumps(sel)})"))  # document coordinates, also in an RTL page
    if not r:
        raise CDPError(f"selector {sel!r} matches nothing")
    s.page.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))")
    x, y, w, h, sx, sy = r
    dw, dh, cw, ih = s.doc_size()
    if shot == "viewport":
        return {"x": sx, "y": sy, "width": cw, "height": ih}
    if shot == "element":
        x0, y0 = max(0, x - pad), max(0, y - pad - 28)  # 28 px more above for the annotation label
        return {"x": x0, "y": y0, "width": min(dw, x + w + pad) - x0, "height": min(dh, y + h + pad + (28 if y < 30 else 0)) - y0}
    # region: the full page width (so content past the screen edge shows), the element's band plus padding
    y0 = max(0, y - pad - 28)
    height = min(dh, y + h + pad) - y0
    height = min(height, max(ih * 1.5, 900))
    return {"x": 0, "y": y0, "width": max(dw, cw, width_hint or 0), "height": height}


def compare(plan: dict, out: Path, args: dict) -> int:
    fmt, q = args.get("format", "webp"), int(args.get("quality", 80))
    only = set(filter(None, (args.get("only") or "").split(",")))
    vps = {v["label"]: v for v in viewports_of(plan)}
    s = Session(plan, args)
    res = {**meta_block(s, plan), "mode": "compare", "issues": []}
    failures = 0
    try:
        for it in plan.get("issues", []):
            if only and it["id"] not in only:
                continue
            vp = vps.get(it["viewport"]) if isinstance(it.get("viewport"), str) else {**{"label": "custom", "mobile": it["viewport"]["w"] < 1024}, **it["viewport"]}
            if not vp:
                raise SystemExit(f"{it['id']}: unknown viewport {it.get('viewport')!r}")
            theme, sel, shot, pad = it.get("theme", "light"), it["selector"], it.get("shot", "region"), int(it.get("pad", 24))
            entry = {"id": it["id"], "route": it["route"], "viewport": vp["label"], "w": vp["w"], "h": vp["h"], "theme": theme, "selector": sel, "shot": shot,
                     "fix_css": it.get("fix_css"), "fix_js": it.get("fix_js")}
            n_err, n_blk = len(s.errors), len(s.blocked)
            try:
                s.set_viewport(vp, theme)
                s.goto(it["route"], it.get("ready"), it.get("setup_js"))
                before_probe, before = s.probe(), s.target(sel)
                if before.get("error"):
                    raise CDPError(f"{sel!r}: {before['error']}")
                mbv = it.get("must_be_visible") or []
                vis_b = s.visible(mbv) if mbv else None
                s.page.eval(SEEN_JS)  # what the before state shows, kept in the page to tell revealed elements from changed ones
                edge = before_probe["doc"]["h_scroll"] or before["rect"][0] + before["rect"][2] > vp["w"] + 1
                label = it["id"].translate(LATIN_DIGITS)  # the burned-in label is a Latin identifier, whatever the page's digits
                s.page.eval(f"window.__detectMark({json.dumps(sel)}, {{color: '#e5484d', label: {json.dumps(label + ' · before')}, edge: {json.dumps(edge)}}})")
                clip_b = region_clip(s, sel, shot, pad)
                b_img = out / f"{it['id']}-before.{fmt}"
                s.shoot(b_img, clip_b, fmt, q)
                s.page.eval("window.__detectUnmark()")
                # apply the candidate fix live, in the browser only
                if it.get("fix_css"):
                    s.page.eval(f"(() => {{ const st = document.createElement('style'); st.id = '__detect_fix'; st.textContent = {json.dumps(it['fix_css'])}; document.head.appendChild(st); return true; }})()")
                if it.get("fix_js"):
                    s.page.eval(f"(async () => {{ await ({it['fix_js']})(true); return true; }})()", timeout=30)
                s.page.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))")
                s.page.idle(0.3)
                after_probe, after = s.probe(), s.target(sel)
                vis_a = s.visible(mbv) if mbv else None
                revealed = s.revealed(after_probe)
                s.page.eval(f"window.__detectMark({json.dumps(sel)}, {{color: '#30a46c', label: {json.dumps(label + ' · after')}, edge: {json.dumps(edge)}}})")
                clip_a = region_clip(s, sel, shot, pad)
                if shot == "region":  # the same frame width on both sides, so the two images line up
                    clip_a["width"] = max(clip_a["width"], clip_b["width"])
                a_img = out / f"{it['id']}-after.{fmt}"
                s.shoot(a_img, clip_a, fmt, q)
                s.page.eval("window.__detectUnmark()")
                entry.update({"before": {"img": rel_path(b_img, out), "w": round(clip_b["width"]), "h": round(clip_b["height"])},
                              "after": {"img": rel_path(a_img, out), "w": round(clip_a["width"]), "h": round(clip_a["height"])},
                              "figures": {"before": summary(before_probe, before), "after": summary(after_probe, after)}})
                entry["resolved"], entry["judgement"] = judge(entry["figures"]["before"], entry["figures"]["after"],
                                                              it.get("judge_kinds"), revealed, vis_b, vis_a)
                if it.get("regress", True):
                    cb, ca = entry["figures"]["before"]["counts"], entry["figures"]["after"]["counts"]
                    gone = {k for k in cb if ca.get(k, 0) < cb[k]}
                    entry["regression"] = regress(s, it, [v for v in viewports_of(plan) if v["label"] != vp["label"]], theme, gone)
                if it.get("design"):
                    D = it["design"]
                    s.navigate(s.url_of(D["url"]))
                    s.wait_ready(D.get("ready"))
                    s.prepare()
                    d_img = out / f"{it['id']}-design.{fmt}"
                    clip_d = region_clip(s, D["selector"], shot, pad)
                    s.shoot(d_img, clip_d, fmt, q)
                    entry["design"] = {"img": rel_path(d_img, out), "w": round(clip_d["width"]), "h": round(clip_d["height"]), "url": D["url"]}
            except CDPError as e:
                entry["error"] = str(e)
                failures += 1
            entry.update({"errors": s.errors[n_err:], "blocked": s.blocked[n_blk:]})
            res["issues"].append(entry)
            print(f"{it['id']:<10} {vp['label']:<10} " + (f"ERROR {entry['error']}" if "error" in entry else
                  f"resolved={entry['resolved']} regressions={sum(len(r['new']) + len(r.get('hidden', {})) for r in entry.get('regression', []))}"
                  + "".join(f" still-at-{r['w']}={','.join(r['still'])}" for r in entry.get("regression", []) if r.get("still"))
                  + "".join(f" hidden-at-{r['w']}={','.join(r['hidden'])}" for r in entry.get("regression", []) if r.get("hidden"))
                  + ("" if entry["resolved"] == "yes" else f" ({entry['judgement']['reason']})")), flush=True)
    finally:
        s.close()
    old = out / "compare.json"
    if only and old.is_file():  # --only re-pictures some issues: keep the others from the previous run
        prev = json.loads(old.read_text(encoding="utf-8"))
        redone = {i["id"] for i in res["issues"]}
        order = [i["id"] for i in plan.get("issues", [])]
        res["issues"] = sorted([i for i in prev.get("issues", []) if i["id"] not in redone] + res["issues"],
                               key=lambda i: order.index(i["id"]) if i["id"] in order else 999)
    old.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"→ {out / 'compare.json'} · {len(res['issues'])} issues · {failures} failed")
    return 1 if failures else 0


def summary(pr: dict, tg: dict) -> dict:
    """The figures that go into a finding: the page-level counts and the subject element's own facts."""
    return {"h_scroll": pr["doc"]["h_scroll"], "doc_width": pr["doc"]["scroll_w"], "viewport_w": pr["viewport"]["w"], "counts": pr["counts"],
            "target": {k: tg.get(k) for k in ("rect", "right_edge", "scroll", "font", "contrast", "hit_self", "hit", "overflow", "display") if k in tg}}


def judge(b: dict, a: dict, kinds: list[str] | None = None, revealed: dict | None = None,
          vis_b: dict | None = None, vis_a: dict | None = None) -> tuple[str, dict]:
    """'yes' when an issue kind the page showed before is gone or reduced after and nothing new appeared; 'no' when the fix
    adds an issue, or leaves a `must_be_visible` control off the visible screen; 'unmeasured' when the probes see no
    difference (alignment, spacing and similar judgements), in which case the before/after images are the evidence and
    the reviewer must say so. Every kind counts (offscreen_control like any other) unless the plan issue names its
    `judge_kinds`; the other kinds' changes are reported as information. A rise made only of issues on elements the
    before state did not show (`revealed`: a window the fix brings on screen, with its own old contrast and target
    issues) is information too: the fix revealed it, it did not cause it. A revealed issue whose element got worse than
    its own baseline before the fix (`worsened`: smaller font, lower contrast, smaller target, a more scaled or newly
    broken image) is not excused and counts like a new one.

    `revealed` is Session.revealed()'s {"revealed": {kind: n}, "worsened": {kind: n}, "elements": [...]} (a plain
    {kind: n} is read as revealed counts with nothing worsened). The judgement keeps the English `reason` and adds
    `reason_code` + `reason_args` for translated reports:
      not_visible     no          {controls: [{sel, code, args}]}  (control codes from VISIBLE_JS)
      adds_issues     no          {kinds: {kind: [before, after]}, elements?: [{kind, sel, metric, before, after}]}
      revealed_worse  no          {kinds: {...}, elements: [...]}  the rise counts only because revealed elements got worse
      improved        yes         {parts: [{code: kind_down, kind, before, after} | {code: page_width, before, after}
                                          | {code: contrast, before, after} | {code: back_on_screen, sels}]}
      no_difference   unmeasured  {judged_only: bool}
    Returns (verdict, judgement)."""
    revealed = revealed or {}
    if "revealed" not in revealed and "worsened" not in revealed and "elements" not in revealed:
        revealed = {"revealed": revealed}
    rev, wor = revealed.get("revealed") or {}, revealed.get("worsened") or {}
    every = set(b["counts"]) | set(a["counts"])
    judged = set(kinds) if kinds else every
    j: dict = {"kinds": sorted(judged) if kinds else "all"}
    worse, gone, info, shown, worsened = {}, {}, {}, {}, {}
    only_worsened = True  # every counted rise would have been excused if its revealed elements had not got worse
    for k in sorted(every):
        nb, na = b["counts"].get(k, 0), a["counts"].get(k, 0)
        if nb == na:
            continue
        excused = rev.get(k, 0) - wor.get(k, 0)  # revealed and merely present: information
        if k not in judged:
            info[k] = [nb, na]
        elif na < nb:
            gone[k] = [nb, na]
        elif na - excused <= nb:  # the whole rise sits on elements the fix brought into view, none of them made worse
            info[k], shown[k] = [nb, na], rev[k]
        else:
            worse[k] = [nb, na]
            if wor.get(k):
                worsened[k] = wor[k]
            only_worsened = only_worsened and bool(wor.get(k)) and na - rev.get(k, 0) <= nb
    elements = [e for e in revealed.get("elements") or [] if e.get("kind") in worse]
    why = [f"{k} {v[0]}→{v[1]}" for k, v in gone.items()]
    parts = [{"code": "kind_down", "kind": k, "before": v[0], "after": v[1]} for k, v in gone.items()]
    if (not kinds or "h_overflow" in judged) and b["h_scroll"] and not a["h_scroll"]:
        why.append(f"page width {b['doc_width']}→{a['doc_width']} px")
        parts.append({"code": "page_width", "before": b["doc_width"], "after": a["doc_width"]})
    c_b, c_a = b["target"].get("contrast"), a["target"].get("contrast")
    if (not kinds or "low_contrast" in judged) and c_b and c_a and c_b["ratio"] < c_b["need"] <= c_a["ratio"]:
        why.append(f"contrast {c_b['ratio']}:1→{c_a['ratio']}:1")
        parts.append({"code": "contrast", "before": c_b["ratio"], "after": c_a["ratio"]})
    hidden = {sel: r for sel, r in (vis_a or {}).items() if not r.get("visible")}
    back = [sel for sel, r in (vis_b or {}).items() if not r.get("visible") and (vis_a or {}).get(sel, {}).get("visible")]
    if back:
        why.append("back on screen: " + ", ".join(back))
        parts.append({"code": "back_on_screen", "sels": back})
    if hidden:
        verdict, j["reason"] = "no", "must_be_visible: " + "; ".join(f"{s} {r.get('reason', '')}" for s, r in hidden.items())
        j["reason_code"] = "not_visible"
        j["reason_args"] = {"controls": [{"sel": s, "code": r.get("code", ""), "args": r.get("args") or {}} for s, r in hidden.items()]}
    elif worse:
        verdict, j["reason"] = "no", "adds " + ", ".join(f"{k} {v[0]}→{v[1]}" for k, v in worse.items())
        j["reason_code"] = "revealed_worse" if only_worsened else "adds_issues"
        j["reason_args"] = {"kinds": dict(worse), **({"elements": elements} if elements else {})}
    elif why:
        verdict, j["reason"] = "yes", "; ".join(why)
        j["reason_code"], j["reason_args"] = "improved", {"parts": parts}
    else:
        verdict, j["reason"] = "unmeasured", "no measured difference" + (" in the judged kinds" if kinds else "")
        j["reason_code"], j["reason_args"] = "no_difference", {"judged_only": bool(kinds)}
    j["counted"] = {**gone, **worse}
    if info:
        j["info"] = info
    if shown:
        j["revealed"] = shown
    if worsened:
        j["worsened"] = worsened
    if vis_a is not None:
        j["must_be_visible"] = {"before": vis_b or {}, "after": vis_a}
    return verdict, j


def regress(s: Session, it: dict, vps: list[dict], theme: str, fixed_kinds: set) -> list[dict]:
    """Probes the route at the other viewports without and with the fix. `new`: issue kinds the fix adds there.
    `still`: kinds the fix removed at the pictured width but leaves unchanged here, i.e. the fix does not work at this
    width (a fix checked only where the picture was taken can look complete and not be). `hidden`: `must_be_visible`
    selectors the fix takes off the screen here (visible without it). With `judge_kinds`, other kinds' rises and
    rises made only of revealed elements go to `info` instead of `new`, as in the pictured width's verdict (a revealed
    element that got worse than its own baseline is not excused)."""
    out, kinds, mbv = [], set(it.get("judge_kinds") or []), it.get("must_be_visible") or []
    for vp in vps:
        s.set_viewport(vp, theme)
        s.goto(it["route"], it.get("ready"), it.get("setup_js"))
        base = s.probe()["counts"]
        vis_b = s.visible(mbv) if mbv else {}
        s.page.eval(SEEN_JS)
        if it.get("fix_css"):
            s.page.eval(f"(() => {{ const st = document.createElement('style'); st.textContent = {json.dumps(it['fix_css'])}; document.head.appendChild(st); return true; }})()")
        if it.get("fix_js"):
            s.page.eval(f"(async () => {{ await ({it['fix_js']})(true); return true; }})()", timeout=30)
        s.page.eval("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))")
        pr = s.probe()
        fixed, rv = pr["counts"], s.revealed(pr)
        excused = {k: n - rv["worsened"].get(k, 0) for k, n in rv["revealed"].items()}  # worsened revealed issues count
        new, info = {}, {}
        for k, v in fixed.items():
            if v > base.get(k, 0):
                ((info if (kinds and k not in kinds) or v - excused.get(k, 0) <= base.get(k, 0) else new))[k] = [base.get(k, 0), v]
        still = {k: [base[k], fixed.get(k, 0)] for k in fixed_kinds if base.get(k, 0) and fixed.get(k, 0) >= base[k]}
        row = {"viewport": vp["label"], "w": vp["w"], "new": new, "still": still}
        if info:
            row["info"] = info
        if mbv:
            vis_a = s.visible(mbv)
            hidden = {sel: vis_a[sel].get("reason", "") for sel in mbv if vis_b[sel].get("visible") and not vis_a[sel].get("visible")}
            if hidden:
                row["hidden"] = hidden
        out.append(row)
    return out


def diff(a_path: Path, b_path: Path, as_json: bool) -> int:
    """Two surveys of the same routes and widths, taken before and after a change: what changed where."""
    A = json.loads(a_path.read_text(encoding="utf-8"))
    B = json.loads(b_path.read_text(encoding="utf-8"))
    key = lambda c: (c["route"], c["w"], c.get("theme", "light"))
    a, b = {key(c): c for c in A["cells"]}, {key(c): c for c in B["cells"]}
    rows, worse, better = [], 0, 0
    for k in sorted(set(a) | set(b), key=lambda k: (k[0], k[1], k[2])):
        ca, cb = a.get(k), b.get(k)
        row = {"route": k[0], "w": k[1], "theme": k[2]}
        if not ca or not cb:
            row["status"] = "only in " + ("after" if cb else "before")
            rows.append(row)
            continue
        if "error" in ca or "error" in cb:
            row.update({"status": "error", "before_error": ca.get("error"), "after_error": cb.get("error")})
            worse += "error" in cb and "error" not in ca
            rows.append(row)
            continue
        na, nb = ca["probe"]["counts"], cb["probe"]["counts"]
        up = {kind: [na.get(kind, 0), nb.get(kind, 0)] for kind in set(na) | set(nb) if nb.get(kind, 0) > na.get(kind, 0)}
        down = {kind: [na.get(kind, 0), nb.get(kind, 0)] for kind in set(na) | set(nb) if nb.get(kind, 0) < na.get(kind, 0)}
        hs = [ca["probe"]["doc"]["h_scroll"], cb["probe"]["doc"]["h_scroll"]]
        status = "worse" if up or (hs[1] and not hs[0]) else "better" if down or (hs[0] and not hs[1]) else "same"
        worse += status == "worse"
        better += status == "better"
        row.update({"status": status, "worse": up, "better": down, "h_scroll": hs,
                    "doc_width": [ca["probe"]["doc"]["scroll_w"], cb["probe"]["doc"]["scroll_w"]],
                    "doc_height": [ca["probe"]["doc"]["scroll_h"], cb["probe"]["doc"]["scroll_h"]],
                    "shots": [str((a_path.parent / ca["shot"]).resolve()) if ca.get("shot") else None,
                              str((b_path.parent / cb["shot"]).resolve()) if cb.get("shot") else None],
                    "new_errors": [e for e in cb.get("errors", []) if e not in ca.get("errors", [])]})
        worse += bool(row["new_errors"]) and status != "worse"
        rows.append(row)
    out = {"before": str(a_path), "after": str(b_path), "worse": worse, "better": better, "cells": rows}
    (b_path.parent / "diff.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    if as_json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
    else:
        for r in rows:
            line = f"{r['route']:<28} {r['w']:>5} {r['theme']:<5} {r['status'].upper():<8}"
            if r.get("worse"):
                line += "  worse: " + ", ".join(f"{k} {v[0]}→{v[1]}" for k, v in sorted(r["worse"].items()))
            if r.get("better"):
                line += "  better: " + ", ".join(f"{k} {v[0]}→{v[1]}" for k, v in sorted(r["better"].items()))
            if r.get("h_scroll") and r["h_scroll"][0] != r["h_scroll"][1]:
                line += f"  page width {r['doc_width'][0]}→{r['doc_width'][1]}"
            if r.get("doc_height") and abs(r["doc_height"][1] - r["doc_height"][0]) > 1:
                line += f"  height {r['doc_height'][0]}→{r['doc_height'][1]}"
            if r.get("new_errors"):
                line += f"  NEW ERRORS: {r['new_errors'][0]}"
            print(line)
        print(f"→ {b_path.parent / 'diff.json'} · {better} better · {worse} worse · look at the before/after images of every changed cell (paths in diff.json)")
    return 1 if worse else 0


def parse_args(argv: list[str]) -> tuple[list[str], dict]:
    pos, opts, i = [], {}, 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("--"):
            has_value = i + 1 < len(argv) and not argv[i + 1].startswith("--")
            opts[a[2:].replace("-", "_")] = argv[i + 1] if has_value else True  # a bare flag such as --json
            i += 2 if has_value else 1
        else:
            pos.append(a)
            i += 1
    return pos, opts


def main(argv: list[str]) -> int:
    for stream in (sys.stdout, sys.stderr):  # Windows consoles default to a legacy code page
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    pos, opts = parse_args(argv[1:])
    if opts.get("help") or pos[:1] in (["-h"], ["help"]):
        print(__doc__)
        return 0
    if not pos:
        print(__doc__)
        return 2
    cmd = pos[0]
    if cmd == "check":
        p = opts.get("browser") or find_browser()
        if not p:
            print("no Chromium-family browser found: install Chrome, Edge or Chromium, or set DETECT_BROWSER")
            return 1
        with Browser(p) as b:
            print(f"browser: {p}\nversion: {b.version().get('Browser')}")
        return 0
    if cmd == "viewports":
        for v in PRESETS[pos[1] if len(pos) > 1 else "standard"]:
            print(f"{v['label']:<10} {v['w']}x{v['h']}{'  mobile' if v['mobile'] else ''}")
        return 0
    if cmd == "diff" and len(pos) == 3:
        return diff(Path(pos[1]), Path(pos[2]), bool(opts.get("json")))
    if cmd not in ("survey", "compare") or len(pos) < 2 or "out" not in opts:
        print(__doc__)
        return 2
    plan = json.loads(Path(pos[1]).read_text(encoding="utf-8"))
    if not re.match(r"^[a-z][a-z0-9+.-]*:", plan.get("base_url", "")):  # a folder of static pages, relative to the plan
        plan["base_url"] = (Path(pos[1]).resolve().parent / plan.get("base_url", ".")).resolve().as_uri() + "/"
    out = Path(opts["out"])
    out.mkdir(parents=True, exist_ok=True)
    try:
        return survey(plan, out, opts) if cmd == "survey" else compare(plan, out, opts)
    except CDPError as e:
        print(f"ui_capture: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
