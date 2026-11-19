# Snap Web Assistant

> A Chrome Manifest V3 extension for `web.snapchat.com` — screenshot-bypass
> and local-only media saver. **Personal/educational project.** Nothing ever
> leaves the browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4.svg)
![Status](https://img.shields.io/badge/status-archived-lightgrey.svg)

---

## Why this project

This is a portfolio piece demonstrating advanced browser-extension
engineering: running code in the page's **main world** before any page
script executes, surgically overriding native APIs, bridging two isolated
execution worlds, and relaying work to a service worker. It was built to
explore how modern web apps detect focus/visibility and how a Manifest V3
extension can intercept media at the `Blob`/`URL` layer.

## What it does

1. **Screenshot bypass** — keeps the page rendering when the window loses
   focus: spoofs `document.hasFocus()`, `document.hidden`, and
   `visibilityState`; swallows global `blur`/`focus`/`visibilitychange`
   listeners registered on `window`/`document`; neutralizes
   `onblur`/`onvisibilitychange` handlers; guards `PrintScreen` /
   `Ctrl+Shift+S` keyboard listeners; scrubs blur CSS while unfocused.
2. **Media saving** — captures `blob:` images and videos as they load and
   lets you download them with a double-click, with an optional auto-save
   mode. Files land in `Downloads/SnapWeb/`.

## Highlights / engineering notes

- **Two-world architecture.** `content.js` runs in the **MAIN** world (to
  override native functions Snapchat's code calls); `bridge.js` runs in the
  **ISOLATED** world (to use `chrome.*` APIs). They communicate over
  `window.postMessage` with a versioned channel. MAIN-world code never
  touches `chrome.*`.
- **`document_start` injection** so patches land before any page script
  runs — critical, since listeners registered later can't be un-registered.
- **Pristine-reference stashing** before patching, so every override can be
  toggled on/off at runtime without reloading the page.
- **Blob retention strategy.** `URL.createObjectURL` is hooked to map
  `blobUrl → Blob`; `URL.revokeObjectURL` is swallowed while saving is
  enabled so `chrome.downloads` can still resolve the URL; an in-page
  anchor-download fallback runs if the service worker can't fetch it.
- **Closed Shadow DOM toast** so UI is immune to page CSS.
- **Zero network requests** — everything stays local; settings in
  `chrome.storage.local`.

## Tech stack

- JavaScript (ES2022), HTML/CSS
- Chrome Extensions Manifest V3 (service worker, content scripts, `world: "MAIN"`)
- `chrome.storage`, `chrome.downloads`, `chrome.runtime` messaging
- Node.js for tooling/tests

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the component diagram and data
flow.

## Repository layout

```
snap-web-assistant/
├── README.md          overview (this file)
├── ARCHITECTURE.md    component diagram + data flow
├── LICENSE            MIT
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
└── CHANGELOG.md
```

> Source code is intentionally not published in this repository. This repo
> is a documentation showcase of the project's design and engineering.

## Privacy & ethics

This tool is for **personal/educational use only**. Saving or sharing
private content without the sender's consent may violate Snapchat's Terms of
Service and local law. The extension performs zero network requests; all
processing happens in your own browser. Not affiliated with Snap Inc.

## Status

Archived showcase. Not actively maintained. OS-level capture (screen
recording, phone photos, etc.) is unaffected by anything a web page can do.