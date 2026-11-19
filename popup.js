/**
 * Snap Web Assistant — popup.js
 * Binds the three toggles to chrome.storage.local (same keys that
 * bridge.js pushes into the MAIN world). No inline scripts: MV3 CSP-safe.
 */
'use strict';

const ROWS = [
  ['bypass', 'bypass'],
  ['save', 'saveMedia'],
  ['auto', 'autoDownload'],
];

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;

  for (const [id, key] of ROWS) {
    $(id).addEventListener('change', (e) => {
      chrome.storage.local.set({ [key]: e.target.checked });
    });
  }

  $('reset').addEventListener('click', () => {
    chrome.storage.local.set({ savedCount: 0 });
  });

  refresh();
});

function refresh() {
  chrome.storage.local.get(['bypass', 'saveMedia', 'autoDownload', 'savedCount']).then((o) => {
    $('bypass').checked = o.bypass !== false;
    $('save').checked = o.saveMedia !== false;
    $('auto').checked = !!o.autoDownload;
    $('count').textContent = 'Downloads: ' + (o.savedCount || 0);
  }).catch(() => {});
}

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && 'savedCount' in ch) {
    $('count').textContent = 'Downloads: ' + (ch.savedCount.newValue || 0);
  }
});
