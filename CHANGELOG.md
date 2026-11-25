# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- "View-on-phone snaps" toggle: renders snaps gated behind an
  "open on phone" prompt in a local browser overlay (closed Shadow DOM),
  with a Save button reusing the existing download path. Falls back to the
  most recent captured media blob when the DOM doesn't expose one.

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