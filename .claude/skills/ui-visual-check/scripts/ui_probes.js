/* UI review DOM probes (/detect and /ui-visual-check), injected by ui_capture.py into the page under test.
   Measure the DOM; a screenshot is not a check. Every figure here comes from layout (getBoundingClientRect,
   getComputedStyle, elementFromPoint), and every probe returns ONE JSON string, because a structured
   return value can be lost silently on the way back from the page.

   window.__detectProbe(opts)   -> JSON string with page facts, issue candidates and design-consistency stats
   window.__detectTarget(sel)   -> JSON string with the facts about one element (for before/after figures)
   window.__detectMark(sel, o)  -> draws the annotation overlay used in before/after images; __detectUnmark() removes it
   window.__detectClip(sel)     -> scrolls one element into view and returns its capture frame (used for the image clips)
   window.__detectStart()       -> pans an RTL page that is wider than the screen to its inline start, as a phone opens it
                                   (__detectProbe() does this first unless called with {keep_scroll: true})
   window.__detectIntrinsic(el, reuse) -> page-side helper (an object, not a string; ui_capture.py's SEEN_JS and
                                   REVEALED_JS call it in the page): the element's own measurable facts, used as its
                                   baseline before a fix and compared after it; null for an element with no own text
                                   that is neither interactive nor an image
   window.__detectInteractive   -> the selector that defines an interactive control
*/
(() => {
  const MAX_PER_KIND = 12;
  const OWN = "__detect";
  const vw = () => document.documentElement.clientWidth;
  const vh = () => window.innerHeight;
  const cs = (el) => getComputedStyle(el);
  const r1 = (n) => Math.round(n * 10) / 10;
  const rect = (el) => { const r = el.getBoundingClientRect(); return [r1(r.left + scrollX), r1(r.top + scrollY), r1(r.width), r1(r.height)]; };

  function selectorOf(el) {
    if (!(el instanceof Element)) return "";
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) return "#" + el.id;
    const parts = [];
    for (let e = el, depth = 0; e && e.nodeType === 1 && e !== document.documentElement && depth < 6; e = e.parentElement, depth++) {
      let s = e.tagName.toLowerCase();
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) { parts.unshift("#" + e.id); break; }
      const cls = (e.getAttribute("class") || "").split(/\s+/).filter((c) => c && !c.startsWith(OWN) && /^[A-Za-z_][\w-]*$/.test(c)).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      const sib = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [];
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(s);
      const sel = parts.join(" > ");
      // a bare tag such as "a:nth-of-type(4)" is unique but tells a reader nothing: keep climbing to a named ancestor
      const named = parts.some((p) => p.includes(".") || p.startsWith("#"));
      try { if (named && document.querySelectorAll(sel).length === 1) return sel; } catch {}
    }
    return parts.join(" > ");
  }

  /* Shown = has a box, is not hidden, and is not clipped away by a collapsed or scrolled ancestor.
     A row inside a collapsed container keeps a real rect and a real offsetParent, so test the ancestors. */
  function shown(el) {
    if (el.closest("[hidden],[aria-hidden=true]") || el.closest("." + OWN)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = cs(el);
    if (s.visibility === "hidden" || s.visibility === "collapse" || +s.opacity === 0) return false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = cs(a);
      if (as.display === "contents") continue;
      if (+as.opacity === 0 || as.visibility === "hidden") return false;
      if (as.overflowX !== "visible" || as.overflowY !== "visible") {
        const ar = a.getBoundingClientRect();
        if (ar.width < 1 || ar.height < 1) return false;
        if (r.right <= ar.left || r.left >= ar.right || r.bottom <= ar.top || r.top >= ar.bottom) {
          // outside the ancestor's box: hidden unless that ancestor scrolls to it
          const scrolls = /(auto|scroll)/.test(as.overflowX + as.overflowY);
          if (!scrolls) return false;
        }
      }
    }
    return true;
  }
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const textOf = (el) => (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("alt") || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const INTERACTIVE = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[role=menuitem],[tabindex]:not([tabindex='-1'])";

  /* The ancestors whose overflow clips el's painting. An absolutely positioned box escapes the clipping of ancestors
     between it and its containing block, a fixed box escapes every ancestor clip unless an ancestor becomes its
     containing block (transform, filter, perspective, contain). Stops below <body>, as shown() does. */
  function clipBoxes(el) {
    const boxes = [];
    let esc = /^(absolute|fixed)$/.test(cs(el).position) ? cs(el).position : null;
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const as = cs(a);
      if (as.display === "contents") continue;
      const cbAll = as.transform !== "none" || as.filter !== "none" || as.perspective !== "none" || /paint|layout|strict|content/.test(as.contain);
      const cb = esc === null || cbAll || (esc === "absolute" && as.position !== "static");
      if (!cb) continue;
      if (as.overflowX !== "visible" || as.overflowY !== "visible") boxes.push(a);
      esc = /^(absolute|fixed)$/.test(as.position) ? as.position : null;
    }
    return boxes;
  }
  /* A fixed box (el or an ancestor) that lies wholly outside [L, R]: an off-canvas drawer parked there on purpose. */
  function parkedOffCanvas(el, L, R) {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      if (cs(a).position !== "fixed") continue;
      const ar = a.getBoundingClientRect();
      if (ar.right <= L + 1 || ar.left >= R - 1) return true;
    }
    return false;
  }
  /* The part of el's box that is actually painted: its rect cut by every box that clips it (clipBoxes). Content
     scrolled or clipped out of its container still has a full rect in layout without being seen there. */
  function paintedRect(el) {
    const r = el.getBoundingClientRect();
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (const a of clipBoxes(el)) {
      const ar = a.getBoundingClientRect(), as = cs(a);
      if (as.overflowX !== "visible") { L = Math.max(L, ar.left); R = Math.min(R, ar.right); }
      if (as.overflowY !== "visible") { T = Math.max(T, ar.top); B = Math.min(B, ar.bottom); }
    }
    return { left: L, top: T, right: R, bottom: B, width: Math.max(0, R - L), height: Math.max(0, B - T) };
  }
  /* A layer painted behind the content (a wallpaper or backdrop): a negative z-index on it or on a positioned
     ancestor, or a pointer-events:none layer with no text and no controls. It neither covers nor obscures anything. */
  function behindContent(el) {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const z = cs(a).zIndex;
      if (z !== "auto" && parseInt(z, 10) < 0) return true;
    }
    return cs(el).pointerEvents === "none" && !el.querySelector(INTERACTIVE) && !(el.innerText || "").trim();
  }
  /* Client coordinates of the document's top-left corner (the origin of a full-page capture). In an RTL page the
     horizontal scroll runs from -(scrollWidth - clientWidth) to 0, so the left edge lies that far before scrollX 0. */
  function docOrigin() {
    const de = document.documentElement, rtlScroll = cs(de).direction === "rtl" ? de.scrollWidth - de.clientWidth : 0;
    return { x: -(scrollX + rtlScroll), y: -scrollY };
  }

  /* colours and contrast (WCAG 2.2 relative luminance) */
  function parseColor(s) {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  /* Elements that paint an image (background-image, gradient, img, video, canvas, svg), found once per probe: text over
     one of them, with no opaque colour in between, has no background colour that styles can tell. */
  let painters = null;
  const paintersNow = () => painters || (painters = [...document.body.querySelectorAll("*")].filter((e) => {
    if (e.closest("." + OWN) || e.closest("svg") && e.tagName.toLowerCase() !== "svg") return false;
    const s = cs(e);
    if (!(/^(IMG|VIDEO|CANVAS|PICTURE|OBJECT|EMBED|IFRAME)$/.test(e.tagName) || e.tagName.toLowerCase() === "svg" || (s.backgroundImage && s.backgroundImage !== "none"))) return false;
    const r = e.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1 && s.visibility === "visible" && +s.opacity > 0;
  }));
  const IMAGE = "image";
  function backgroundOf(el) {
    let layers = [], opaque = false;
    for (let e = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.backgroundImage && s.backgroundImage !== "none") return IMAGE; // an image or gradient: cannot be decided from styles
      const c = parseColor(s.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) { opaque = true; break; } }
    }
    if (!opaque) {  // nothing opaque behind the text in its own ancestry: a wallpaper or picture laid under it decides
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (paintersNow().some((p) => !el.contains(p) && !p.contains(el) && (() => { const pr = p.getBoundingClientRect(); return x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom; })())) return IMAGE;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
    return base;
  }
  /* null when there is nothing to measure; {unmeasurable} when the text sits on an image; otherwise the WCAG figures */
  function contrastOf(el) {
    const s = cs(el), fg = parseColor(s.color), bg = backgroundOf(el);
    if (bg === IMAGE) return fg ? { unmeasurable: "background image", fg: s.color } : null;
    if (!fg || !bg) return null;
    const f = blend(fg, bg), L1 = lum(f), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize), bold = parseInt(s.fontWeight, 10) >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    return { ratio: r1(ratio), need: large ? 3 : 4.5, large, fg: s.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})` };
  }

  function elementFacts(el) {
    const s = cs(el), r = el.getBoundingClientRect();
    const o = {
      sel: selectorOf(el), tag: el.tagName.toLowerCase(), text: textOf(el), rect: rect(el), display: s.display, position: s.position,
      font: `${s.fontSize} / ${s.lineHeight} ${s.fontWeight}`, family: s.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      overflow: `${s.overflowX} ${s.overflowY}`, scroll: [el.scrollWidth, el.clientWidth, el.scrollHeight, el.clientHeight],
      right_edge: r1(r.right), viewport: [vw(), vh()], doc_width: document.documentElement.scrollWidth,
    };
    const c = hasOwnText(el) ? contrastOf(el) : null;
    const v = window.visualViewport, VL = v ? v.offsetLeft : 0, VR = VL + (v ? v.width : vw());
    o.visual = [r1(VL), r1(VR)];
    o.on_screen = r.width >= 1 && r.left >= VL - 1 && r.right <= VR + 1;  // wholly inside the visible screen width (must_be_visible)
    if (c && c.unmeasurable) o.contrast_unmeasurable = c.unmeasurable;
    else if (c) o.contrast = c;
    if (r.width && r.height && r.top < vh() && r.bottom > 0 && r.left < vw() && r.right > 0) {
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw() - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), vh() - 1);
      const hit = document.elementFromPoint(cx, cy);
      o.hit_self = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      if (!o.hit_self && hit) o.hit = selectorOf(hit);
    }
    return o;
  }

  /* Show the page the way a phone opens it: an RTL page that is wider than the screen starts at its right edge, but
     Chromium's mobile emulation leaves the visual viewport at the left edge of the widened layout. Pans the visual
     viewport (and scrolls the page) to the inline start; LTR pages and pages that fit are left alone. */
  function start() {
    const de = document.documentElement, v = window.visualViewport;
    const rtl = cs(de).direction === "rtl" || (document.body && cs(document.body).direction === "rtl");
    const pos = () => (v ? [r1(v.pageLeft), r1(v.offsetLeft), r1(v.width)] : [r1(scrollX), 0, vw()]);
    const before = pos();
    if (rtl && document.body && de.scrollWidth > (v ? v.width : vw()) + 1) {
      window.scrollTo(0, scrollY);  // the inline start of an RTL page is scrollX 0; the rest is negative
      const m = document.createElement("div");
      m.className = OWN; m.setAttribute("aria-hidden", "true");
      m.style.cssText = `position:absolute;right:0;top:${v ? v.pageTop : scrollY}px;width:1px;height:1px;pointer-events:none;visibility:hidden`;
      document.body.appendChild(m);
      m.scrollIntoView({ block: "nearest", inline: "nearest" });
      m.remove();
    }
    return { rtl, before, after: pos() };
  }

  function probe(opts = {}) {
    painters = null;
    const started = opts.keep_scroll ? null : start();
    const vv = window.visualViewport;
    const out = { url: location.href, title: document.title, lang: document.documentElement.lang || "", dir: cs(document.documentElement).direction,
      viewport: { w: vw(), h: vh(), dpr: devicePixelRatio, inner_w: innerWidth,
        visual: vv ? [r1(vv.offsetLeft), r1(vv.offsetLeft + vv.width)] : [0, vw()], ...(started && started.before.join() !== started.after.join() ? { panned_to_start: true } : {}) },
      doc: { scroll_w: document.documentElement.scrollWidth, scroll_h: document.documentElement.scrollHeight },
      meta_viewport: document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? null, issues: [], counts: {}, stats: {} };
    const add = (kind, el, detail) => {
      out.counts[kind] = (out.counts[kind] || 0) + 1;
      if (out.counts[kind] <= MAX_PER_KIND) out.issues.push({ kind, sel: el ? selectorOf(el) : "", text: el ? textOf(el) : "", rect: el ? rect(el) : null, ...detail });
    };
    if (out.meta_viewport == null) add("no_viewport_meta", null, { detail: "no <meta name=viewport>; phones lay the page out at about 980 px and shrink it" });
    const all = [...document.body.querySelectorAll("*")].filter((e) => !e.closest("script,style,noscript,template,svg *,." + OWN));
    const vis = all.filter(shown);
    const W = vw(), rtl = out.dir === "rtl";

    /* 1. horizontal overflow of the page: outermost elements that stick out of the viewport and are not inside a scroller */
    const reported = [];
    {  // checked even when the page itself does not scroll: html/body overflow:hidden cuts the content off instead
      for (const el of vis) {
        const r = el.getBoundingClientRect();
        if (r.right <= W + 1 && r.left >= -1) continue;
        if (reported.some((p) => p.contains(el))) continue;
        let inScroller = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const as = cs(a);
          if (as.overflowX !== "visible") { const ar = a.getBoundingClientRect(); if (ar.right <= W + 1 && ar.left >= -1) { inScroller = true; break; } }
        }
        if (inScroller) continue;
        if (parkedOffCanvas(el, 0, W)) continue; // off-canvas drawer (or a control in one) parked outside the screen on purpose
        if (behindContent(el)) continue;          // a wallpaper or backdrop wider than the screen hides nothing
        reported.push(el);
        add("h_overflow", el, { right: r1(r.right), left: r1(r.left), viewport_w: W, by: r1(rtl ? -r.left : r.right - W) });
      }
    }
    out.doc.h_scroll = out.doc.scroll_w > W + 1;

    /* 2. text cut off by its own box */
    for (const el of vis) {
      if (!hasOwnText(el) && !(el.tagName === "BUTTON" || el.tagName === "A")) continue;
      const s = cs(el);
      const clipX = s.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1;
      const clipY = s.overflowY !== "visible" && el.scrollHeight > el.clientHeight + 2 && !/(auto|scroll)/.test(s.overflowY);
      if (!clipX && !clipY) continue;
      if (/(auto|scroll)/.test(s.overflowX) && clipX && !clipY) continue; // a horizontal scroller is not clipping
      const ell = s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none" && s.webkitLineClamp;
      add(ell ? "truncated" : "clipped_text", el, { scroll: [el.scrollWidth, el.clientWidth, el.scrollHeight, el.clientHeight], ellipsis: !!ell });
    }

    /* 3. interactive controls that are covered by something else, and 4. targets that are too small */
    const inter = vis.filter((e) => e.matches(INTERACTIVE));
    out.stats.interactive = inter.length;
    let small44 = 0;
    for (const el of inter) {
      const r = el.getBoundingClientRect();
      const inline = el.tagName === "A" && el.parentElement && /^(P|LI|SPAN|TD|LABEL|SMALL)$/.test(el.parentElement.tagName) && el.parentElement.innerText.trim().length > textOf(el).length + 10;
      if (!inline && (r.width < 24 || r.height < 24) && !(el.type === "checkbox" || el.type === "radio") ) add("small_target", el, { size: [r1(r.width), r1(r.height)], need: 24 });
      if (!inline && (r.width < 44 || r.height < 44)) small44++;
      // test the centre of the painted part: a control scrolled out of its scroller is clipped, not covered
      const pr = paintedRect(el);
      if (pr.width >= 1 && pr.height >= 1 && pr.top >= 0 && pr.bottom <= vh() && pr.left >= 0 && pr.right <= W) {
        const hit = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);
        if (hit && hit !== el && !behindContent(hit) && !el.contains(hit) && !hit.contains(el) && !hit.closest("label")?.contains(el) && !(el.labels && [...el.labels].some((l) => l.contains(hit))))
          add("obscured", el, { covered_by: selectorOf(hit), covered_text: textOf(hit) });
      }
    }
    out.stats.targets_under_44 = small44;

    /* 3b. controls outside the visible screen that no scroll container can bring into view. Measured against the visual
       viewport: a mobile browser widens its layout to fit overflowing content, so the layout width still contains them
       while the phone shows only part of the page (an RTL taskbar pushed past the left edge). Clipped controls count
       too (shown() drops them): a control cut off by an overflow:hidden box that is itself off the screen is the defect. */
    {
      const [VL, VR] = out.viewport.visual;
      const onScreen = (r) => r.left >= VL - 1 && r.right <= VR + 1;
      const ctrls = all.filter((e) => e.matches(INTERACTIVE) && !e.closest("[hidden],[aria-hidden=true],[inert]"));
      let offscreen = 0;
      for (const el of ctrls) {
        const r = el.getBoundingClientRect(), s = cs(el);
        if (r.width < 1 || r.height < 1 || s.visibility !== "visible" || +s.opacity === 0) continue;
        if (r.right > VL + 1 && r.left < VR - 1) continue;  // at least partly on the screen
        if (parkedOffCanvas(el, VL, VR)) continue;           // off-canvas drawer parked outside on purpose
        let intended = false;  // a scroller can bring it into view, or an on-screen box clips it on purpose (carousel page)
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (+cs(a).opacity === 0) { intended = true; break; }
        if (!intended) for (const a of clipBoxes(el)) {
          const as = cs(a);
          if (as.overflowX === "visible") continue;
          if (/(auto|scroll)/.test(as.overflowX) && a.scrollWidth > a.clientWidth + 1) { intended = true; break; }
          if (onScreen(a.getBoundingClientRect())) { intended = true; break; }
        }
        if (intended) continue;
        offscreen++;
        add("offscreen_control", el, { left: r1(r.left), right: r1(r.right), visible: [r1(VL), r1(VR)] });
      }
      out.stats.offscreen_controls = offscreen;
    }

    /* 5. overlapping text blocks and controls (neither contains the other) */
    const blocks = vis.filter((e) => (hasOwnText(e) || e.matches(INTERACTIVE)) && !["absolute", "fixed"].includes(cs(e).position)).slice(0, 500);
    // compare only the part each element actually paints: content scrolled or clipped out of its container's box (rows
    // below a scrolled list's bottom edge) lies under a bar in layout without being seen there
    const rs = blocks.map(paintedRect);
    let pairs = 0;
    for (let i = 0; i < blocks.length && pairs < 40; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = rs[i], b = rs[j];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4 && !blocks[i].contains(blocks[j]) && !blocks[j].contains(blocks[i])) {
        pairs++; add("overlap", blocks[i], { with: selectorOf(blocks[j]), with_text: textOf(blocks[j]), overlap: [r1(ox), r1(oy)] });
      }
    }

    /* 6. text too small to read, 7. contrast */
    const texts = vis.filter(hasOwnText);
    const sizes = {}, families = {}, colors = {};
    const minPx = W < 768 ? 12 : 11;
    let lowContrast = 0, unmeasurable = 0;  // unmeasurable: text over an image, judged on the screenshot instead
    for (const el of texts) {
      const s = cs(el), px = parseFloat(s.fontSize);
      sizes[px] = (sizes[px] || 0) + 1;
      const fam = s.fontFamily.split(",")[0].replace(/["']/g, "").trim(); families[fam] = (families[fam] || 0) + 1;
      colors[s.color] = (colors[s.color] || 0) + 1;
      if (px < minPx) add("small_text", el, { font_px: px, min_px: minPx });
      const c = contrastOf(el);
      if (c && c.unmeasurable) { unmeasurable++; continue; }
      if (c && c.ratio < c.need && !el.closest("[disabled],[aria-disabled=true]") && !el.matches(":disabled")) { lowContrast++; add("low_contrast", el, c); }
    }

    /* 8. images: broken, distorted, blurry */
    for (const img of vis.filter((e) => e.tagName === "IMG")) {
      const r = img.getBoundingClientRect(), s = cs(img);
      if (img.complete && img.naturalWidth === 0) { add("img_broken", img, { src: (img.currentSrc || img.src).slice(0, 120) }); continue; }
      if (!img.naturalWidth) continue;
      const nat = img.naturalWidth / img.naturalHeight, ren = r.width / r.height;
      if (s.objectFit === "fill" && Math.abs(ren / nat - 1) > 0.04) add("img_distorted", img, { natural: [img.naturalWidth, img.naturalHeight], rendered: [r1(r.width), r1(r.height)] });
      if (r.width * devicePixelRatio > img.naturalWidth * 1.25 && r.width > 64) add("img_upscaled", img, { natural: [img.naturalWidth, img.naturalHeight], rendered: [r1(r.width), r1(r.height)], dpr: devicePixelRatio });
    }

    /* 9. fixed or sticky bars that take a large share of a small screen */
    for (const el of vis.filter((e) => ["fixed", "sticky"].includes(cs(e).position) && !behindContent(e))) {
      const r = el.getBoundingClientRect();
      const share = (Math.max(0, Math.min(r.bottom, vh()) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0))) / (W * vh());
      if (share > 0.25 && W < 1024) add("fixed_cover", el, { share: r1(share * 100) });
    }

    /* 10. very long lines on wide screens */
    if (W >= 1024) for (const el of texts.filter((e) => /^(P|LI|DD|BLOCKQUOTE)$/.test(e.tagName))) {
      const px = parseFloat(cs(el).fontSize), chars = el.getBoundingClientRect().width / (px * 0.5);
      if (chars > 110 && el.innerText.length > 160) add("long_lines", el, { approx_chars: Math.round(chars) });
    }

    /* design-consistency statistics (judged by the reviewer, not flagged automatically) */
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
    const spacing = {}, radii = {};
    for (const el of vis.slice(0, 1500)) {
      const s = cs(el);
      for (const p of ["marginTop", "marginBottom", "paddingTop", "paddingLeft", "rowGap", "columnGap"]) { const v = parseFloat(s[p]); if (v > 0) spacing[v] = (spacing[v] || 0) + 1; }
      const rr = parseFloat(s.borderTopLeftRadius); if (rr > 0) radii[rr] = (radii[rr] || 0) + 1;
    }
    const offScale = Object.entries(spacing).filter(([v]) => +v % 4 !== 0).reduce((a, [, n]) => a + n, 0), allSp = Object.values(spacing).reduce((a, n) => a + n, 0);
    out.stats = { ...out.stats, text_elements: texts.length, font_sizes: top(sizes, 14), font_families: top(families, 6), text_colors: Object.keys(colors).length,
      spacing_values: top(spacing, 16), spacing_off_4px_grid_pct: allSp ? r1((offScale / allSp) * 100) : 0, radii: top(radii, 8), low_contrast: lowContrast,
      contrast_unmeasurable: unmeasurable };
    return JSON.stringify(out);
  }

  function target(sel) {
    let el = null;
    try { el = document.querySelector(sel); } catch (e) { return JSON.stringify({ sel, error: "bad selector: " + e.message }); }
    if (!el) return JSON.stringify({ sel, error: "no element matches" });
    painters = null;
    return JSON.stringify({ ...elementFacts(el), shown: shown(el) });
  }

  /* Annotation overlay: an outline around the subject and, for overflow, the screen edge. It never takes pointer
     events and is declared as a rendering aid. It is drawn in the subject's own coordinate space, measured from
     getBoundingClientRect against the overlay's own origin, so it stays on the subject when the page scrolls before the
     capture: in the document for ordinary content, in a fixed layer for content inside a position:fixed box (a fixed
     bar does not move with the page, and under mobile emulation its box is not where page coordinates put it). */
  function mark(sel, o = {}) {
    unmark();
    const el = sel ? document.querySelector(sel) : null;
    const col = o.color || "#e5484d";
    const layer = (fixed) => {
      const d = document.createElement("div");
      d.className = OWN; d.setAttribute("aria-hidden", "true");
      d.style.cssText = `position:${fixed ? "fixed" : "absolute"};left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none`;
      document.body.appendChild(d);
      return d;
    };
    const root = layer(false), origin = root.getBoundingClientRect(), doc = docOrigin();
    if (el) {
      let inFixed = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) if (cs(a).position === "fixed") { inFixed = true; break; }
      const host = inFixed ? layer(true) : root, o0 = inFixed ? host.getBoundingClientRect() : origin;
      const r = el.getBoundingClientRect(), x = r.left - o0.left, y = r.top - o0.top, w = r.width, h = r.height;
      const minX = doc.x - o0.left;  // the document's left edge: a label further left would fall outside the capture
      const box = document.createElement("div");
      box.style.cssText = `position:absolute;left:${x - 4}px;top:${y - 4}px;width:${w + 8}px;height:${h + 8}px;border:3px dashed ${col};border-radius:6px;box-sizing:border-box`;
      host.appendChild(box);
      if (o.label) {
        const tag = document.createElement("div");
        tag.textContent = String(o.label).replace(/[۰-۹٠-٩]/g, (c) => String((c.charCodeAt(0) & 0xF) % 10));
        tag.lang = "en"; tag.dir = "ltr";
        tag.style.cssText = `position:absolute;left:${Math.max(minX, x - 4)}px;top:${r.top - doc.y >= 30 ? y - 28 : y + h + 8}px;background:${col};color:#fff;padding:0 7px;border-radius:4px;white-space:nowrap`;
        // the label is a Latin identifier: a page font that draws Persian digits (or an RTL context) must not restyle it
        for (const [k, v] of [["font", "600 12px/20px system-ui, sans-serif"], ["font-feature-settings", "normal"], ["font-variant-numeric", "normal"],
          ["letter-spacing", "normal"], ["text-transform", "none"], ["direction", "ltr"], ["unicode-bidi", "isolate"]]) tag.style.setProperty(k, v, "important");
        host.appendChild(tag);
      }
    }
    if (o.edge) {  // the layout's screen edge; content beyond it is hatched (left of it in an RTL page, right in LTR)
      const de = document.documentElement, H = de.scrollHeight, W = vw();
      const icbL = de.getBoundingClientRect().left - origin.left, docL = doc.x - origin.left, docR = docL + de.scrollWidth;
      const rtl = cs(de).direction === "rtl", at = rtl ? icbL : icbL + W, from = rtl ? docL : at, to = rtl ? at : docR;
      const top = doc.y - origin.top;
      const line = document.createElement("div");
      line.style.cssText = `position:absolute;left:${at}px;top:${top}px;width:0;height:${H}px;border-left:2px dashed ${col}`;
      const beyond = document.createElement("div");
      beyond.style.cssText = `position:absolute;left:${from}px;top:${top}px;width:${Math.max(0, to - from)}px;height:${H}px;background:repeating-linear-gradient(45deg,${col}22 0 8px,transparent 8px 16px)`;
      root.append(beyond, line);
    }
    return JSON.stringify({ marked: !!el });
  }
  /* The capture frame for one element: scrolls it into view, then returns [x, y, w, h, vx, vy] in the coordinates of a
     full-page capture (the document's top-left corner is 0, 0, also in an RTL page) with vx, vy the visible screen's
     top-left corner. Returns "null" when nothing matches. */
  function clip(sel) {
    const e = document.querySelector(sel);
    if (!e) return "null";
    e.scrollIntoView({ block: "center", inline: "nearest" });
    const r = e.getBoundingClientRect(), d = docOrigin(), v = window.visualViewport;
    return JSON.stringify([r1(r.left - d.x), r1(r.top - d.y), r1(r.width), r1(r.height), r1((v ? v.offsetLeft : 0) - d.x), r1((v ? v.offsetTop : 0) - d.y)]);
  }
  function unmark() { document.querySelectorAll("body > ." + OWN).forEach((n) => n.remove()); return "{}"; }

  /* The element's own facts, the ones the intrinsic issue kinds measure (small_text, low_contrast, small_target and the
     img_* kinds). Computed font size and colours exist even under display:none, so text size and contrast are measured
     for a closed window as it is; target size and image scaling need a box and are null without one. `reuse` keeps the
     image-painter list of the previous call (a caller walking many elements of one unchanged page). */
  function intrinsic(el, reuse) {
    if (!reuse) painters = null;
    const text = hasOwnText(el), ctl = el.matches(INTERACTIVE), img = el.tagName === "IMG";
    if (!text && !ctl && !img) return null;
    const r = el.getBoundingClientRect(), box = r.width >= 1 && r.height >= 1, r2 = (n) => Math.round(n * 100) / 100;
    const o = { font_px: null, contrast: null, target_px: null, upscale: null, distortion: null, broken: null };
    if (text) {
      o.font_px = parseFloat(cs(el).fontSize);
      const c = contrastOf(el);
      o.contrast = c && !c.unmeasurable ? c.ratio : null;
    }
    if (ctl && box) o.target_px = r1(Math.min(r.width, r.height));
    if (img) {
      o.broken = el.complete && el.naturalWidth === 0 ? 1 : 0;
      if (box && el.naturalWidth) {
        o.upscale = r2((r.width * devicePixelRatio) / el.naturalWidth);
        o.distortion = r2(Math.abs((r.width / r.height) / (el.naturalWidth / el.naturalHeight) - 1));
      }
    }
    return o;
  }

  window.__detectProbe = probe;
  window.__detectTarget = target;
  window.__detectMark = mark;
  window.__detectUnmark = unmark;
  window.__detectStart = () => JSON.stringify(start());
  window.__detectClip = clip;
  window.__detectIntrinsic = intrinsic;
  window.__detectInteractive = INTERACTIVE;
})();
