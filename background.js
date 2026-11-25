/**
 * Snap Web Assistant — background.js (MV3 service worker)
 * Responsibilities:
 *   1. Seed default settings on install.
 *   2. Handle DOWNLOAD requests: chrome.downloads.download of the page's
 *      blob: URL (kept alive by content.js swallowing revocations).
 *
 * No network requests are ever made. Everything stays local.
 */

const DEFAULTS = {
  bypass: true,      // screenshot-bypass mode
  saveMedia: true,   // double-click save + blob capture
  autoDownload: false,
  showPhoneSnaps: true,
  savedCount: 0,
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULTS)).then((o) => {
    const missing = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (o[k] === undefined) missing[k] = v;
    }
    if (Object.keys(missing).length) chrome.storage.local.set(missing);
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || msg.type !== 'DOWNLOAD' || typeof msg.url !== 'string') return;

  const filename = sanitizeFilename(msg.filename || fallbackName());

  // Subfolder inside the user's Downloads directory.
  chrome.downloads.download(
    { url: msg.url, filename: 'SnapWeb/' + filename, conflictAction: 'uniquify', saveAs: false },
    (id) => {
      const err = chrome.runtime.lastError;
      if (err || !id) {
        // e.g. blob URL already dead / not resolvable from this context.
        // content.js will fall back to an in-page anchor download.
        respond({ ok: false, error: err ? err.message : 'no download id' });
        return;
      }
      awaitCompletion(id, respond);
    }
  );

  return true; // keep the message channel open for the async respond()
});

/** Resolve when the download completes/interrupts (with a safety timeout). */
function awaitCompletion(id, respond) {
  let settled = false;
  const done = (ok, error) => {
    if (settled) return;
    settled = true;
    chrome.downloads.onChanged.removeListener(onDelta);
    respond({ ok, error });
  };
  const onDelta = (delta) => {
    if (!delta || delta.id !== id) return;
    const s = delta.state && delta.state.current;
    if (s === 'complete') done(true);
    else if (s === 'interrupted') done(false, (delta.error && delta.error.current) || 'download interrupted');
  };
  chrome.downloads.onChanged.addListener(onDelta);
  setTimeout(() => done(true), 15000); // safety net: don't strand the page
}

function sanitizeFilename(n) {
  return String(n).replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').slice(0, 180) || 'snapblob.bin';
}

function fallbackName() {
  const d = new Date();
  const z = (x) => String(x).padStart(2, '0');
  return `snapblob_${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}.bin`;
}
