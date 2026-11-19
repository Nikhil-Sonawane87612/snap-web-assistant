# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-11-19

### Added
- Initial release.
- Screenshot bypass: swallows global blur/focus/visibility listeners,
  spoofs `document.hasFocus()`/`hidden`/`visibilityState`, neutralizes
  `onblur`/`onvisibilitychange` handlers, guards PrintScreen / Ctrl+Shift+S,
  scrubs blur CSS while unfocused.
- Media capture: hooks `URL.createObjectURL`/`revokeObjectURL`, double-click
  to download, optional auto-save, in-page anchor fallback.
- Popup with three toggles, download counter, reset.
- Local-only: zero network requests.