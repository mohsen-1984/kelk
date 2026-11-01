#!/usr/bin/env python3
"""A small Chrome DevTools Protocol client (standard library only), shared by /detect and /ui-visual-check.

It drives an already-installed Chromium-family browser (Google Chrome, Microsoft Edge, Chromium,
or a Playwright-downloaded Chromium) in headless mode, over the DevTools WebSocket. Nothing has to be
installed: no Playwright, no Node.js, no pip packages. `ui_capture.py` is the only user of this module.

  find_browser()                 path of an installed browser, or None (honours $DETECT_BROWSER)
  Browser(path).start()          launches it headless with a throw-away profile; .close() ends it
  browser.new_page()             a Page (one DevTools WebSocket session to one tab)
  page.send(method, params)      a command; returns its result or raises CDPError
  page.on(event, fn)             handler called for every such event, even while waiting on a command
  page.wait_event(name, pred)    blocks until the event arrives

Run `python3 cdp.py --check` to see which browser would be used and whether it starts.
"""
from __future__ import annotations

import base64
import json
import os
import platform
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


class CDPError(RuntimeError):
    pass


# --- browser discovery -------------------------------------------------------------------------

def _playwright_chromes() -> list[Path]:
    """Chromium builds downloaded by any Playwright (Node, Python, .NET or Java); newest first."""
    roots = []
    if os.environ.get("PLAYWRIGHT_BROWSERS_PATH"):
        roots.append(Path(os.environ["PLAYWRIGHT_BROWSERS_PATH"]))
    home = Path.home()
    roots += [home / "AppData" / "Local" / "ms-playwright", home / "Library" / "Caches" / "ms-playwright",
              home / ".cache" / "ms-playwright", Path("/opt/pw-browsers")]
    found = []
    for r in roots:
        if not r.is_dir():
            continue
        for d in sorted(r.glob("chromium-*"), key=lambda p: p.name, reverse=True):
            for rel in ("chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux64/chrome", "chrome-linux/chrome",
                        "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
                        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"):
                if (d / rel).is_file():
                    found.append(d / rel)
    return found


def browser_candidates() -> list[Path]:
    env = os.environ.get("DETECT_BROWSER") or os.environ.get("CHROME_PATH")
    out = [Path(env)] if env else []
    system = platform.system()
    if system == "Windows":
        for base in filter(None, [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA")]):
            out += [Path(base) / "Google/Chrome/Application/chrome.exe", Path(base) / "Microsoft/Edge/Application/msedge.exe",
                    Path(base) / "Chromium/Application/chrome.exe", Path(base) / "BraveSoftware/Brave-Browser/Application/brave.exe"]
    elif system == "Darwin":
        for app in ("Google Chrome.app/Contents/MacOS/Google Chrome", "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                    "Chromium.app/Contents/MacOS/Chromium", "Brave Browser.app/Contents/MacOS/Brave Browser"):
            out += [Path("/Applications") / app, Path.home() / "Applications" / app]
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable", "chrome", "msedge"):
        p = shutil.which(name)
        if p:
            out.append(Path(p))
    return out + _playwright_chromes()


def find_browser() -> Path | None:
    for p in browser_candidates():
        if p.is_file():
            return p
    return None


# --- a minimal WebSocket client (RFC 6455, client side, text frames) -----------------------------

class WebSocket:
    def __init__(self, url: str, timeout: float = 30):
        assert url.startswith("ws://"), url
        hostport, _, path = url[5:].partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        # No Origin header: Chrome rejects DevTools WebSocket connections from unexpected origins.
        req = (f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(req.encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise CDPError("WebSocket handshake: connection closed")
            head += chunk
        status = head.split(b"\r\n", 1)[0]
        if b" 101 " not in status:
            raise CDPError(f"WebSocket handshake refused: {status.decode(errors='replace')}")
        self.buf = head.split(b"\r\n\r\n", 1)[1]

    def _read(self, n: int) -> bytes:
        while len(self.buf) < n:
            chunk = self.sock.recv(max(65536, n - len(self.buf)))
            if not chunk:
                raise CDPError("WebSocket closed by the browser")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _send_frame(self, opcode: int, payload: bytes):
        head = bytes([0x80 | opcode])
        n = len(payload)
        if n < 126:
            head += bytes([0x80 | n])
        elif n < 65536:
            head += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            head += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload)) if n < 4096 else _xor_mask(payload, mask)
        self.sock.sendall(head + mask + masked)

    def send(self, text: str):
        self._send_frame(0x1, text.encode("utf-8"))

    def recv(self, timeout: float | None) -> str | None:
        """One complete text message, or None when nothing arrives within `timeout` seconds."""
        self.sock.settimeout(timeout)
        parts = []
        while True:
            try:
                b0, b1 = self._read(2)
            except (socket.timeout, TimeoutError):
                if parts:  # never abandon half a message
                    self.sock.settimeout(30)
                    continue
                return None
            self.sock.settimeout(30)  # the rest of a started frame must arrive
            opcode, n = b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            if b1 & 0x80:
                mask = self._read(4)
                data = _xor_mask(self._read(n), mask)
            else:
                data = self._read(n)
            if opcode == 0x9:  # ping
                self._send_frame(0xA, data)
                continue
            if opcode == 0x8:
                raise CDPError("WebSocket closed by the browser")
            if opcode in (0x1, 0x2, 0x0):
                parts.append(data)
                if b0 & 0x80:
                    return b"".join(parts).decode("utf-8")
            self.sock.settimeout(timeout)

    def close(self):
        try:
            self._send_frame(0x8, b"")
            self.sock.close()
        except OSError:
            pass


def _xor_mask(data: bytes, mask: bytes) -> bytes:
    if not data:
        return data
    n = len(data)
    m = int.from_bytes((mask * (n // 4 + 1))[:n], "big")
    return (int.from_bytes(data, "big") ^ m).to_bytes(n, "big")


# --- DevTools session --------------------------------------------------------------------------

class Page:
    """One tab. Commands are synchronous; events are dispatched to handlers as they arrive."""

    def __init__(self, ws_url: str, target_id: str, browser: "Browser"):
        self.ws = WebSocket(ws_url)
        self.target_id, self.browser = target_id, browser
        self.next_id, self.results, self.handlers, self.events = 0, {}, {}, []

    def on(self, event: str, fn):
        self.handlers.setdefault(event, []).append(fn)

    def send_nowait(self, method: str, params: dict | None = None) -> int:
        self.next_id += 1
        self.ws.send(json.dumps({"id": self.next_id, "method": method, "params": params or {}}))
        return self.next_id

    def _pump(self, timeout: float) -> bool:
        msg = self.ws.recv(timeout)
        if msg is None:
            return False
        m = json.loads(msg)
        if "id" in m:
            self.results[m["id"]] = m
        else:
            self.events.append(m)
            if len(self.events) > 2000:
                del self.events[:1000]
            for fn in self.handlers.get(m.get("method"), []):
                fn(m.get("params", {}))
        return True

    def send(self, method: str, params: dict | None = None, timeout: float = 60) -> dict:
        mid = self.send_nowait(method, params)
        end = time.monotonic() + timeout
        while mid not in self.results:
            left = end - time.monotonic()
            if left <= 0:
                raise CDPError(f"{method}: no answer within {timeout:.0f}s")
            self._pump(min(left, 1.0))
        m = self.results.pop(mid)
        if "error" in m:
            raise CDPError(f"{method}: {m['error'].get('message')} {m['error'].get('data', '')}".strip())
        return m.get("result", {})

    def wait_event(self, name: str, pred=None, timeout: float = 30) -> dict | None:
        """Waits for an event that arrives from now on (earlier ones are ignored)."""
        start = len(self.events)
        end = time.monotonic() + timeout
        while True:
            for m in self.events[start:]:
                if m.get("method") == name and (pred is None or pred(m.get("params", {}))):
                    return m.get("params", {})
            start = len(self.events)
            left = end - time.monotonic()
            if left <= 0:
                return None
            self._pump(min(left, 0.5))

    def idle(self, seconds: float):
        """Processes events (and so answers paused requests) for `seconds`."""
        end = time.monotonic() + seconds
        while (left := end - time.monotonic()) > 0:
            self._pump(min(left, 0.25))

    def eval(self, expr: str, timeout: float = 60, await_promise: bool = True):
        """Evaluates an expression in the page and returns its value (JSON-serialisable values only)."""
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": await_promise,
                                          "userGesture": False}, timeout=timeout)
        if r.get("exceptionDetails"):
            d = r["exceptionDetails"]
            raise CDPError("page script failed: " + (d.get("exception", {}).get("description") or d.get("text", "")).split("\n")[0])
        return r.get("result", {}).get("value")

    def close(self):
        try:
            self.ws.close()
        finally:
            try:
                self.browser.http("/json/close/" + self.target_id)
            except Exception:
                pass


class Browser:
    def __init__(self, path: Path | str | None = None, map_localhost: bool = False, extra_args: list[str] | None = None):
        p = Path(path) if path else find_browser()
        if not p:
            raise CDPError("no Chromium-family browser found (Chrome, Edge or Chromium); set DETECT_BROWSER to its path")
        self.path, self.map_localhost, self.extra = p, map_localhost, extra_args or []
        self.proc, self.port, self.profile = None, None, None

    def start(self, timeout: float = 30) -> "Browser":
        self.profile = tempfile.mkdtemp(prefix="detect-ui-")
        args = [str(self.path), "--headless=new", "--remote-debugging-port=0", f"--user-data-dir={self.profile}",
                "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
                "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
                "--force-color-profile=srgb", "--font-render-hinting=none", "--mute-audio", "--hide-crash-restore-bubble"]
        if self.map_localhost:  # 'localhost' may resolve to ::1 first where IPv6 loopback is blocked; keeps the Origin header
            args.append("--host-resolver-rules=MAP localhost 127.0.0.1")
        args += self.extra + ["about:blank"]
        flags = subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
        port_file = Path(self.profile) / "DevToolsActivePort"
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if port_file.is_file():
                try:  # on Windows the browser may still hold the file open while writing it
                    lines = port_file.read_text().split()
                except OSError:
                    lines = []
                if lines:
                    self.port = int(lines[0])
                    break
            if self.proc.poll() is not None:
                raise CDPError(f"{self.path.name} exited at start (code {self.proc.returncode})")
            time.sleep(0.1)
        if not self.port:
            self.close()
            raise CDPError(f"{self.path.name} did not open a DevTools port within {timeout:.0f}s")
        return self

    def http(self, path: str, method: str = "GET") -> dict | list | str:
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", method=method)
        with urllib.request.urlopen(req, timeout=15) as r:  # local DevTools endpoint only
            body = r.read().decode()
        try:
            return json.loads(body)
        except ValueError:
            return body

    def version(self) -> dict:
        return self.http("/json/version")

    def new_page(self) -> Page:
        t = self.http("/json/new?about:blank", method="PUT")
        return Page(t["webSocketDebuggerUrl"], t["id"], self)

    def close(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        if self.profile:
            shutil.rmtree(self.profile, ignore_errors=True)

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.close()


def main(argv: list[str]) -> int:
    if "--check" not in argv:
        print(__doc__)
        return 2
    path = find_browser()
    if not path:
        print("no browser found. Install Chrome, Edge or Chromium, or set DETECT_BROWSER to the executable.")
        print("looked in:", *[str(p) for p in browser_candidates()], sep="\n  ")
        return 1
    with Browser(path) as b:
        v = b.version()
        page = b.new_page()
        ok = page.eval("1 + 1") == 2
        page.close()
    print(f"browser: {path}\nversion: {v.get('Browser')}\nprotocol: {v.get('Protocol-Version')}\nevaluate: {'ok' if ok else 'FAILED'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
