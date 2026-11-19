# Snap Web Assistant

[![CI](https://github.com/Nikhil-Sonawane87612/snap-web-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/Nikhil-Sonawane87612/snap-web-assistant/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4.svg)](https://developer.chrome.com/docs/extensions/mv3/)

A Chrome (Manifest V3) extension for **web.snapchat.com** that:

1. **Screenshot bypass** — keeps the page from hiding/blurring when the window
   loses focus, spoofs `document.hasFocus()`, and keeps Snapchat's screenshot
   detection (PrintScreen / Ctrl+Shift+S listeners) from ever seeing your keys.
2. **Media saving** — captures `blob:` images and videos as they load and lets
   you download them with a double-click (plus an optional auto-save mode).

> ⚠️ **This tool is for personal/educational use only. Respect the privacy of
> others.** Saving or sharing private content without the sender's consent may
> violate Snapchat's Terms of Service and local law. Everything runs locally in
> your browser — **no data is ever sent to any server** (and this extension
> contains no code that could do so). Not affiliated with Snap Inc.

---

## Requirements

- Google Chrome **111+** (needs native `world: "MAIN"` content scripts).
- Desktop OS (Windows/macOS/Linux).

## Installation (unpacked / developer mode)

1. Download/clone this folder (`snap-web-assistant/`).
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `snap-web-assistant` folder.
5. **Reload any open `web.snapchat.com` tab** — content scripts only inject at
   `document_start`, so an already-open tab won't be patched until refreshed.

Expected on-page result: a yellow console banner
`[SnapWebAssistant] loaded (MAIN world, document_start) — screenshot bypass ON`.

## Usage

| Action | Result |
|---|---|
| Toggle shot in the popup | Enables/disables screenshot bypass live |
| **Double-click** an image or video | Downloads that media (toast confirms) |
| Popup → "Auto-save media" | Saves videos + images > 128 KB automatically as they load |
| Popup counter | Shows how many files were saved since install |

Files land in `Downloads/SnapWeb/` named like
`snapblob_2026-11-01T14-09-33.mp4` / `.png` / `.webp`.

If the background `chrome.downloads` path fails (e.g. the page revokes a blob
URL before this extension loaded), an in-page anchor-download fallback runs
automatically using the Blob reference the extension retained.

## Settings

Persisted in `chrome.storage.local`; pushed live into the page:

| Key | Default | Meaning |
|---|---|---|
| `bypass` | `true` | Anti-screenshot machinery (see below) |
| `saveMedia` | `true` | Blob capture + double-click saving |
| `autoDownload` | `false` | Auto-save qualifying media on capture |
| `savedCount` | `0` | Counter (popup “Reset” clears it) |

## How it works

**Architecture** — two content scripts talk to one service worker:

```
content.js (MAIN world)          bridge.js (ISOLATED world)      background.js
─────────────────────────        ──────────────────────────      ─────────────
patches native page APIs    ↕    chrome.storage reader/writer    chrome.downloads
captures blob references    ↕    window.postMessage ⇄ sendMessage  download state
double-click detector       ↕                                      tracking
```

`content.js` must run in the page's **main world** (to override native
functions Snapchat's code calls); the main world can't use `chrome.*` APIs, so
`bridge.js` shuttles settings and save requests between them.

**Screenshot bypass (content.js, injected at `document_start`):**

- `EventTarget.prototype.addEventListener` is wrapped: registrations for
  `blur`/`focus`/`visibilitychange`/`pagehide`/`freeze`/`beforeprint`/
  `afterprint` **on `window`/`document`** are swallowed (element-level
  listeners — inputs, menus — are untouched). Because this runs before any
  page script, Snapchat's handlers are never attached.
- `document.hasFocus()` → always `true`; `document.hidden` → `false`;
  `visibilityState`/`webkitVisibilityState` → `'visible'`. Both on
  `Document.prototype` and the instance, and re-pinned every 500 ms in case
  the page redefines its own properties.
- `window.onblur = …` / `document.onvisibilitychange = …` style handlers are
  neutralized via property descriptors (setter swallows assignments).
- Keyboard listeners are wrapped so `PrintScreen`/`F13` and `Ctrl/Cmd+Shift+S`
  events are dropped before Snapchat's handler runs.
- A `MutationObserver` + 500 ms pulse strips `*blur*` classes and inline
  `filter: blur(...)` from `<html>`/`<body>` while the window is truly
  unfocused (real focus is tracked with pre-patch raw listeners).

**Media scraper:**

- `URL.createObjectURL` is hooked: every Blob the page creates is mapped
  `blobUrl → Blob` (capped/aged to ≤240 entries after 15 min).
- `URL.revokeObjectURL` is **swallowed** while saving is enabled — otherwise
  Snapchat would delete the URL right after display and `chrome.downloads`
  could never resolve it. (Side effect: Blob/URL-table memory is retained
  until the tab is closed. Turn "Media saving" off to restore native behavior.)
- Double-click (capture phase, delegated) resolves the element's
  `currentSrc`/`src` (or `background-image: url(blob:…)`) and, if it starts
  with `blob:`, sends `SAVE_REQ` → `bridge.js` → `chrome.downloads.download`
  in the service worker; failure falls back to the in-page anchor download.

## Testing checklist

- [x] On `web.snapchat.com`, the page does **not** blur/hide when switching tabs.
- [x] `document.hasFocus()` returns `true` even when the window is unfocused
      (verify in DevTools console: unfocus the window, then run it).
- [x] Pressing PrintScreen triggers no Snapchat reaction (with `bypass` on).
- [x] Double-clicking a `<video src="blob:…">` downloads an `.mp4`.
- [x] Double-clicking an `<img src="blob:…">` downloads an `.png`/`.webp` etc.
- [x] No console errors related to CSP or permissions (MAIN-world static
      content scripts are not subject to the page's CSP);
      bridge/background requests respond normally.

## Limitations (be aware)

- **OS-level capture still wins.** Nothing in a web page can prevent
  `Win+Shift+S`, `Cmd+Shift+4`, screen recording, or a phone pointed at the
  monitor. This tool only stops the *page-level* detection/obfuscation.
- **Cat-and-mouse.** If Snapchat changes its detection (own-property
  redefinition, iframe-based native-ref capture, custom event plumbing),
  features may silently degrade. The 500 ms re-pin covers common redefinition.
- **Blob URLs created before injection are lost.** Load the extension, then
  reload the Snapchat tab so every blob is captured from the start.
- Blur scrubbing covers `<html>`/`<body>` class/style mutations; container
  divs styled with inline `backdrop-filter` from other code paths may still
  blur (report/tweak `scrubBlurNow` selectors if needed).
- MAIN-world↔ISOLATED messaging is inherently visible to page scripts; the
  messages only carry settings/requests, never media data — acceptable for a
  personal tool, but worth knowing.
- Swallowed revocations retain memory for the session (bounded by the 240/15-min
  store cap); disabling "Media saving" restores native revocation immediately.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing downloads | Reload the Snapchat tab after loading the extension |

## Repository layout

```
snap-web-assistant/
├── manifest.json          MV3 manifest — permissions: storage, downloads
├── content.js             MAIN world: bypass + blob capture + dblclick + toast
├── bridge.js              ISOLATED world: settings pipe + save-request relay
├── background.js          service worker: defaults + chrome.downloads handling
├── popup.html / popup.js  popup UI (three toggles, counter, warning)
├── tests/                 Node smoke tests
├── scripts/               repo tooling (mojibake/BOM guard)
├── .github/               CI workflows, issue/PR templates
├── build.ps1              packages a release ZIP
├── package.json           npm scripts (check / test / lint)
├── LICENSE                MIT
└── README.md              this file
```

(No icon files are required; Chrome shows its default toolbar icon. Drop PNG
files in and add an `icons` block to `manifest.json` if you want branding.)

## Privacy & permissions

| Permission | Why |
|---|---|
| `storage` | Persist your three toggles + download counter |
| `downloads` | Save files you explicitly trigger (or auto-save) |
| `host_permissions` (web.snapchat.com, www.snapchat.com/web) | Inject the two content scripts |

The extension performs **zero network requests**; all message passing is
between extension contexts and your own browser machinery.

## Uninstall

`chrome://extensions` → *Snap Web Assistant* → **Remove**. Any files already
saved in `Downloads/SnapWeb/` remain yours to delete.

## Credits / prior art (from the project brief)

- Snapchat Unbreaker (focus-tracking bypass): greasyfork.org — script 479894
- SnapEnhance Web (bypass screenshot detection, remove unfocused blur)
- BetterSnap (`ALLOW_SCREENSHOT` feature ID)
- Snapchat Image & Video Downloader (dblclick + blob URL pattern)
- SnapNinja (CDP-level blob interception — this project uses a
  `createObjectURL`/`revokeObjectURL` hook instead, no external tooling)
