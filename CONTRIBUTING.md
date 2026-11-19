# Contributing to Snap Web Assistant

Thanks for your interest in contributing. This project is a Chrome
Manifest V3 extension that runs entirely locally. Please keep that
contract intact.

## Ground rules

- **No network requests.** The extension must never phone home. Any PR
  that adds `fetch`/`XMLHttpRequest`/`WebSocket` to extension code will be
  rejected.
- **Local-only data.** Settings live in `chrome.storage.local`. Do not add
  remote sync or analytics.
- **Respect privacy.** This tool is for personal/educational use. Do not
  add features whose primary purpose is bulk harvesting or redistribution
  of other people's private content.

## Development

1. Clone the repo.
2. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked**
   and select the repo folder.
3. Reload any open `web.snapchat.com` tab after changes.

## Checks before submitting a PR

```sh
node --check background.js
node --check content.js
node --check bridge.js
node --check popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"
node --test tests/*.test.mjs
```

## Style

- Keep the two-world split: `content.js` is MAIN world, `bridge.js` is
  ISOLATED. MAIN world code must never touch `chrome.*`.
- Prefer small, focused changes. Match the existing naming and comment
  style.
- Update `README.md` and `CHANGELOG.md` when behavior changes.

## Reporting issues

Use the issue templates. Include Chrome version, OS, extension version,
and reproduction steps.