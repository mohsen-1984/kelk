/**
 * Unit-test helpers (Node's test runner + jsdom; `npm test`). Two kinds of window:
 *   storageWindow(stored)  config.js + storage.js only, on an http origin (localStorage works);
 *                          `stored` = the localStorage entries before the scripts run, i.e. a reload.
 *   appWindow(stored)      index.html with all its scripts, served from the repository by a resource
 *                          loader on the same http origin (file:// has no localStorage in jsdom).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const ORIGIN = 'http://kelk.test/';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function seed(w, stored) {
  Object.keys(stored || {}).forEach(function (k) {
    w.localStorage.setItem(k, stored[k]);
  });
}

/** Every localStorage entry of a window, as an object (to "reload" it into a new window). */
function dump(w) {
  const out = {};
  for (let i = 0; i < w.localStorage.length; i++) {
    const k = w.localStorage.key(i);
    out[k] = w.localStorage.getItem(k);
  }
  return out;
}

function storageWindow(stored) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: ORIGIN, runScripts: 'outside-only' });
  const w = dom.window;
  seed(w, stored);
  w.eval(read('scripts/config.js'));
  w.eval(read('scripts/storage.js'));
  return w;
}

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

/** Serves http://kelk.test/<path> from the repository (404 for a missing file; nothing else is fetched). */
const repoFiles = requestInterceptor(async function (request) {
  const u = new URL(request.url);
  if (u.origin + '/' !== ORIGIN) return new Response('', { status: 404 });
  try {
    const body = await fs.promises.readFile(path.join(ROOT, decodeURIComponent(u.pathname)));
    return new Response(body, {
      headers: { 'Content-Type': TYPES[path.extname(u.pathname)] || 'application/octet-stream' }
    });
  } catch (e) {
    return new Response('', { status: 404 });
  }
});

/**
 * The app in jsdom, resolved once its load event fired. Browser parts jsdom lacks are stubbed:
 * dialog showModal/close, matchMedia, the clipboard. Script errors fail the test (`errors`).
 */
function appWindow(stored) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) {
    if (e.type !== 'css-parsing' && e.type !== 'not-implemented') errors.push(e);
  });
  const dom = new JSDOM(read('index.html'), {
    url: ORIGIN + 'index.html',
    runScripts: 'dangerously',
    resources: { interceptors: [repoFiles] },
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse: function (w) {
      seed(w, stored);
      const D = w.HTMLDialogElement && w.HTMLDialogElement.prototype;
      if (D && !D.showModal) {
        D.showModal = function () {
          this.open = true;
        };
        D.close = function () {
          this.open = false;
        };
      }
      // no canvas in jsdom: a 2D context whose text widths ignore the font (Kelk.fonts.installed → false)
      w.HTMLCanvasElement.prototype.getContext = function () {
        return {
          font: '',
          measureText: function (t) {
            return { width: String(t).length * 10 };
          }
        };
      };
      if (!w.matchMedia) {
        w.matchMedia = function () {
          return { matches: false, addEventListener: function () {}, removeEventListener: function () {} };
        };
      }
    }
  });
  const w = dom.window;
  return new Promise(function (resolve) {
    w.addEventListener('load', function () {
      resolve({ window: w, errors: errors });
    });
  });
}

module.exports = { ROOT, ORIGIN, storageWindow, appWindow, dump };
