/**
 * Snap Web Assistant — bridge.js
 * ISOLATED-world content script. Sole job: pipe settings from
 * chrome.storage.local into the MAIN world and relay save requests
 * to the background service worker. No page logic runs here.
 */
(() => {
  'use strict';

  const FLAG = '__snapWebAssistantBridge';
  if (window[FLAG]) return;
  try { Object.defineProperty(window, FLAG, { value: true, enumerable: false }); } catch { window[FLAG] = true; }

  const CH = 'SNAP_WEB_ASSISTANT_V1';
  const KEYS = ['bypass', 'saveMedia', 'autoDownload', 'showPhoneSnaps'];

  // Same defaults as content.js and background.js.
  const normalize = (o) => ({
    bypass: o.bypass !== false,
    saveMedia: o.saveMedia !== false,
    autoDownload: !!o.autoDownload,
    showPhoneSnaps: o.showPhoneSnaps !== false,
  });

  function pushSettings() {
    chrome.storage.local.get(KEYS)
      .then((o) => {
        window.postMessage({ channel: CH, dir: 'bridge2main', type: 'SETTINGS', settings: normalize(o) }, '*');
      })
      .catch(() => { /* storage unavailable — MAIN keeps its defaults */ });
  }

  // Live settings: popup toggles propagate instantly to every injected frame.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEYS.some((k) => k in changes)) pushSettings();
  });
  pushSettings();

  function bumpCount() {
    chrome.storage.local.get(['savedCount'])
      .then((o) => chrome.storage.local.set({ savedCount: (o.savedCount || 0) + 1 }))
      .catch(() => {});
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (!m || m.channel !== CH || m.dir !== 'main2bridge') return;

    if (m.type === 'SAVE_REQ' && typeof m.url === 'string') {
      // MAIN world cannot call chrome.* APIs; we forward to the service worker,
      // which uses chrome.downloads.download and reports success/failure back.
      try {
        chrome.runtime.sendMessage(
          { type: 'DOWNLOAD', url: m.url, filename: m.filename },
          (res) => {
            if (chrome.runtime.lastError) {
              window.postMessage({
                channel: CH, dir: 'bridge2main', type: 'SAVE_RESULT',
                id: m.id, ok: false,
                error: chrome.runtime.lastError.message || 'no responder',
              }, '*');
              return;
            }
            window.postMessage({
              channel: CH, dir: 'bridge2main', type: 'SAVE_RESULT',
              id: m.id, ok: !!(res && res.ok), error: res && res.error,
            }, '*');
            if (res && res.ok) bumpCount();
          }
        );
      } catch (e) {
        window.postMessage({ channel: CH, dir: 'bridge2main', type: 'SAVE_RESULT', id: m.id, ok: false, error: String(e) }, '*');
      }
    } else if (m.type === 'STAT_INC') {
      // Anchor-download fallback path (download counted inside MAIN world).
      bumpCount();
    }
  }, false);
})();
