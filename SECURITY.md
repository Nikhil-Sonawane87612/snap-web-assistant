# Security Policy

## Supported versions

Only the latest release on `main` is supported.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Instead,
report privately via GitHub's "Report a vulnerability" feature on the
repository's Security tab, or contact the maintainer directly.

## Scope notes

- The extension performs **zero network requests**. If you find any code
  path that transmits data off-device, that is a critical bug — please
  report it.
- The MAIN-world content script patches native APIs; reports about
  page-level detection evasion are expected behavior, not vulnerabilities.
- The extension stores only local settings and a download counter in
  `chrome.storage.local`. No credentials or message content are stored.