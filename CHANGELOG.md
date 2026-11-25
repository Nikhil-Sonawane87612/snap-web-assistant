# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- "View-on-phone snaps" toggle: adds a per-snap **"View in browser"** button
  to cards gated behind "open the mobile app to view" / "click to view".
  Clicking opens that specific snap in a local overlay (closed Shadow DOM),
  with a Save button reusing the existing download path. No auto-popup.
  Each card is paired with its own media blob, and `MediaSource` URLs are
  captured for streamed snaps (viewable but not savable as files).

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