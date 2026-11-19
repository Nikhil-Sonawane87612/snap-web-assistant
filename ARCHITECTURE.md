# Architecture

## Overview

```
content.js (MAIN world)          bridge.js (ISOLATED world)      background.js
─────────────────────────        ──────────────────────────      ─────────────
patches native page APIs    ↕    chrome.storage reader/writer    chrome.downloads
captures blob references    ↕    window.postMessage ⇄ sendMessage  download state
double-click detector       ↕                                      tracking
```

`content.js` must run in the page's **main world** (to override native
functions Snapchat's code calls); the main world can't use `chrome.*` APIs,
so `bridge.js` shuttles settings and save requests between them.

## Components

### content.js (MAIN world, `document_start`, all frames)

- **Double-injection guard** via a non-enumerable window flag.
- **Pristine-reference stashing** — `EventTarget.prototype.addEventListener`,
  `Document.prototype` property descriptors, `URL.createObjectURL/revokeObjectURL`,
  and `onblur`/`onfocus`/etc. descriptors, captured before patching.
- **Screenshot bypass**
  - `addEventListener` wrapper swallows global `blur`/`focus`/`visibilitychange`/
    `pagehide`/`freeze`/`beforeprint`/`afterprint` listeners on `window`/`document`;
    element-level listeners are untouched.
  - `document.hasFocus()` → always `true`; `document.hidden` → `false`;
    `visibilityState`/`webkitVisibilityState` → `'visible'`. Defined on both
    `Document.prototype` and the instance, re-pinned every 500 ms.
  - `window.onblur`/`document.onvisibilitychange` style handlers neutralized
    via property descriptors (setter swallows assignments).
  - Keyboard listeners wrapped so `PrintScreen`/`F13` and `Ctrl/Cmd+Shift+S`
    events are dropped before Snapchat's handler runs.
  - `MutationObserver` + 500 ms pulse strips `*blur*` classes and inline
    `filter: blur(...)` from `<html>`/`<body>` while truly unfocused (real
    focus tracked with pre-patch raw listeners).
- **Media capture**
  - `URL.createObjectURL` hooked: every Blob the page creates is mapped
    `blobUrl → Blob` (capped/aged to ≤ 240 entries after 15 min).
  - `URL.revokeObjectURL` swallowed while saving is enabled.
  - Double-click (capture phase, delegated) resolves the element's
    `currentSrc`/`src` (or `background-image: url(blob:…)`) and sends
    `SAVE_REQ` to the bridge; failure falls back to in-page anchor download.
- **Toast UI** in a closed Shadow DOM, immune to page CSS.

### bridge.js (ISOLATED world, `document_start`, all frames)

- Reads `chrome.storage.local` and pushes normalized settings into MAIN world.
- Listens to `chrome.storage.onChanged` for live propagation.
- Relays `SAVE_REQ` → `chrome.runtime.sendMessage({ type: 'DOWNLOAD' })`.
- Bumps the download counter on success / anchor fallback.

### background.js (service worker)

- Seeds defaults on install.
- Handles `DOWNLOAD`: `chrome.downloads.download` of the page's blob URL into
  `Downloads/SnapWeb/`, with completion tracking and a 15 s safety timeout.
- Sanitizes filenames.

## Messaging

- Channel name: `SNAP_WEB_ASSISTANT_V1`.
- MAIN → bridge: `SAVE_REQ`, `STAT_INC`.
- bridge → MAIN: `SETTINGS`, `SAVE_RESULT`.

## Data flow (double-click save)

1. User double-clicks media → MAIN resolves blob URL.
2. MAIN posts `SAVE_REQ { id, url, filename }`.
3. Bridge forwards to service worker as `DOWNLOAD`.
4. Service worker calls `chrome.downloads.download`.
5. Result posted back as `SAVE_RESULT`; on failure MAIN runs anchor fallback
   using the retained Blob reference.

## Key design decisions

- **MAIN-world injection is mandatory** because Snapchat's code calls native
  functions directly; only overriding them in the same realm works.
- **Swallowing revocations** is a deliberate trade-off: it keeps blob URLs
  resolvable for downloads at the cost of retaining memory for the session
  (bounded by the store cap).
- **Settings are pushed, not pulled**, so toggles in the popup propagate live
  to every injected frame without a reload.