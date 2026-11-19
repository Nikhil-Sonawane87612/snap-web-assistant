/**
 * Snap Web Assistant — content.js
 * MAIN world, document_start, all frames.
 *
 * Runs BEFORE any page script, which is what makes the patching below work.
 *  - Screenshot bypass: document.hasFocus / hidden / visibilityState spoofing,
 *    swallowing global blur/focus/visibilitychange listeners, guarding
 *    screenshot-related keyboard listeners, scrubbing blur CSS when unfocused.
 *  - Media capture: hooks URL.createObjectURL/revokeObjectURL to keep live
 *    Blob references, supports double-click-to-save via the bridge script +
 *    background service worker, with an in-page anchor-download fallback.
 *
 * Local only. Nothing here performs network requests.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // 0. Double-injection guard (persisted across frames / SPA navigations)
  // ---------------------------------------------------------------------
  const FLAG = '__snapWebAssistantMain';
  if (window[FLAG] === true) return;
  try { Object.defineProperty(window, FLAG, { value: true, enumerable: false }); } catch { window[FLAG] = true; }

  const TAG = '[SnapWebAssistant]';
  const CH = 'SNAP_WEB_ASSISTANT_V1';

  // ---------------------------------------------------------------------
  // 1. Stash pristine references & property descriptors BEFORE patching.
  // ---------------------------------------------------------------------
  const rawAddEL = EventTarget.prototype.addEventListener;

  const PRIO = {
    hidden: Object.getOwnPropertyDescriptor(Document.prototype, 'hidden'),
    visibilityState: Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState'),
    webkitVisibilityState: Object.getOwnPropertyDescriptor(Document.prototype, 'webkitVisibilityState'),
    hasFocus: Object.getOwnPropertyDescriptor(Document.prototype, 'hasFocus'),
  };

  const ON_PROPS = ['onblur', 'onfocus', 'onvisibilitychange', 'onpagehide', 'onfreeze'];
  const ON_BASES = [];
  for (const obj of [window, document]) {
    for (const p of ON_PROPS) {
      let base = obj, d = null;
      while (base && !(d = Object.getOwnPropertyDescriptor(base, p))) base = Object.getPrototypeOf(base);
      if (d) ON_BASES.push({ base, prop: p, desc: d });
    }
  }

  const rawCreateObjectURL = URL.createObjectURL;
  const rawRevokeObjectURL = URL.revokeObjectURL;

  let realFocused = true;
  try {
    realFocused = (PRIO.hasFocus && typeof PRIO.hasFocus.value === 'function')
      ? PRIO.hasFocus.value.call(document)
      : true;
  } catch { /* stays true */ }

  // ---------------------------------------------------------------------
  // 2. State
  // ---------------------------------------------------------------------
  const state = { bypass: true, saveMedia: true, autoDownload: false };
  try {
    Object.defineProperty(window, '__snapWebAssistantDebug', { value: state, enumerable: false });
  } catch { /* ignore */ }

  const blobStore = new Map();  // blobUrl -> { blob, type, size, t }
  const autoSeen  = new Set();  // per-session auto-save dedupe
  let reqSeq = 0;
  const pending = new Map();    // reqId -> { url, filename, timer }
  const MAX_BLOBS = 300;

  // Track REAL focus with raw listeners (registered before patching, so our
  // patch never swallows them).
  try {
    rawAddEL.call(window, 'blur', () => { realFocused = false; scrubBlurNow(); }, true);
    rawAddEL.call(window, 'focus', () => { realFocused = true; }, true);
  } catch { /* ignore */ }

  // ---------------------------------------------------------------------
  // 3. Blob media capture (createObjectURL / revokeObjectURL hooks)
  // ---------------------------------------------------------------------
  URL.createObjectURL = function createObjectURL(obj) {
    const url = rawCreateObjectURL.call(URL, obj);
    try {
      if (obj instanceof Blob) {
        blobStore.set(url, { blob: obj, type: obj.type || '', size: obj.size || 0, t: Date.now() });
        if (blobStore.size > MAX_BLOBS) pruneBlobStore();
        if (state.saveMedia && state.autoDownload) maybeAutoSave(url, obj);
      }
    } catch { /* ignore */ }
    return url;
  };

  URL.revokeObjectURL = function revokeObjectURL(url) {
    // While media saving is enabled we swallow revocations:
    //  - the browser keeps resolving this URL, so chrome.downloads can fetch it;
    //  - we also hold the Blob itself, powering the anchor-download fallback.
    if (state.saveMedia) return;
    return rawRevokeObjectURL.call(URL, url);
  };

  function pruneBlobStore() {
    const cutoff = Date.now() - 15 * 60 * 1000; // drop entries older than 15 min
    for (const [url, e] of blobStore) {
      if (blobStore.size <= 240) break;
      if (e.t < cutoff) blobStore.delete(url);
    }
  }

  function maybeAutoSave(url, blob) {
    if (autoSeen.has(url)) return;
    autoSeen.add(url);
    const video = (blob.type || '').startsWith('video/');
    const image = (blob.type || '').startsWith('image/') && blob.size >= 131072; // >128 KB
    if (!video && !image) return;
    requestSave(url, makeFilename(blob.type || '', video ? 'VIDEO' : 'IMG'));
  }

  // ---------------------------------------------------------------------
  // 4. Filenames — snapblob_YYYY-MM-DDTHH-MM-SS.<ext>
  // ---------------------------------------------------------------------
  const MIME_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  };

  function extFor(mime, tag) {
    const m = String(mime || '').split(';')[0].trim().toLowerCase();
    if (MIME_EXT[m]) return MIME_EXT[m];
    if (m.startsWith('video/')) return 'mp4';
    if (m.startsWith('image/')) return 'png';
    return tag === 'VIDEO' ? 'mp4' : 'png';
  }

  function makeFilename(mime, tag) {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T` +
                  `${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`;
    return `snapblob_${stamp}.${extFor(mime, tag)}`;
  }

  // ---------------------------------------------------------------------
  // 5. Double-click to save (capture phase, delegated)
  // ---------------------------------------------------------------------
  rawAddEL.call(document, 'dblclick', (ev) => {
    if (!state.saveMedia) return;
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const el = t.closest('img, video, [style*="blob:"]');
    if (!el) return;

    let url = '';
    if (el instanceof HTMLImageElement) url = el.currentSrc || el.src || '';
    else if (el instanceof HTMLVideoElement) url = el.currentSrc || el.src || '';
    else {
      // element styled with background-image: url(blob:...)
      const bg = getComputedStyle(el).backgroundImage || '';
      const m = /url\(["']?(blob:[^"')]+)["']?\)/.exec(bg);
      url = m ? m[1] : '';
    }
    url = String(url).split('#')[0];
    if (!url.startsWith('blob:')) return;

    const entry = blobStore.get(url);
    requestSave(url, makeFilename(entry ? entry.type : '', el.tagName));
  }, true);

  // ---------------------------------------------------------------------
  // 6. Save flow: background via bridge → anchor fallback in page
  // ---------------------------------------------------------------------
  function requestSave(url, filename) {
    const id = String(++reqSeq);
    const timer = setTimeout(() => {
      if (pending.delete(id)) anchorFallback(url, filename);
    }, 4000);
    pending.set(id, { url, filename, timer });
    try {
      window.postMessage({ channel: CH, dir: 'main2bridge', type: 'SAVE_REQ', id, url, filename }, '*');
    } catch {
      pending.delete(id);
      anchorFallback(url, filename);
    }
  }

  function anchorFallback(url, filename) {
    const entry = blobStore.get(url);
    const blob = entry && entry.blob;
    if (!blob) {
      toast('Media unavailable (URL already revoked). Reload the page and try again.');
      return;
    }
    try {
      const local = rawCreateObjectURL.call(URL, blob);
      const a = document.createElement('a');
      a.href = local;
      a.download = filename;
      a.rel = 'noopener';
      a.style.cssText = 'position:fixed;left:-4096px;top:-4096px;width:1px;height:1px;';
      const host = document.body || document.documentElement;
      host.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { rawRevokeObjectURL.call(URL, local); } catch { /* ignore */ } }, 30000);
      postToBridge({ type: 'STAT_INC' });
      toast('Saved: ' + filename);
    } catch (e) {
      toast('Save failed: ' + (e && e.message ? e.message : 'unknown error'));
    }
  }

  function postToBridge(payload) {
    try { window.postMessage({ channel: CH, dir: 'main2bridge', ...payload }, '*'); } catch { /* ignore */ }
  }

  // Messages from bridge.js (settings + download results).
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (!m || m.channel !== CH || m.dir !== 'bridge2main') return;

    if (m.type === 'SETTINGS' && m.settings && typeof m.settings === 'object') {
      const was = state.bypass;
      state.bypass = m.settings.bypass !== false;
      state.saveMedia = m.settings.saveMedia !== false;
      state.autoDownload = !!m.settings.autoDownload;
      if (was !== state.bypass) applyBypass(state.bypass);
      if (state.bypass) scrubBlurNow();

    } else if (m.type === 'SAVE_RESULT') {
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(m.id);
      if (m.ok) toast('Saved: ' + p.filename);
      else anchorFallback(p.url, p.filename);
    }
  }, false);

  // ---------------------------------------------------------------------
  // 7. Screenshot-bypass machinery
  // ---------------------------------------------------------------------
  const GLOBAL_FOCUS_EVENTS = new Set([
    'blur', 'focus', 'visibilitychange', 'webkitvisibilitychange',
    'pagehide', 'freeze', 'beforeprint', 'afterprint',
  ]);
  const KEY_EVENTS = new Set(['keydown', 'keyup', 'keypress']);
  const isGlobalTarget = (t) =>
    t === window || t === document || t === document.documentElement;

  /**
   * Swallows global (window/document) focus+visibility listeners entirely and
   * wraps keyboard listeners so PrintScreen-style events never reach Snapchat's
   * handlers. Element-level listeners (inputs etc.) are left untouched.
   */
  const patchedAddEL = function addEventListener(type, listener, options) {
    if (state.bypass) {
      if (GLOBAL_FOCUS_EVENTS.has(type) && isGlobalTarget(this)) return; // swallowed
      if (KEY_EVENTS.has(type)) listener = wrapKeyGuard(listener);
    }
    return rawAddEL.call(this, type, listener, options);
  };

  function wrapKeyGuard(fn) {
    if (typeof fn === 'function') {
      return function guarded(e) { if (isShotEvent(e)) return; return fn.apply(this, arguments); };
    }
    if (fn && typeof fn.handleEvent === 'function') {
      return { handleEvent(e) { if (isShotEvent(e)) return; return fn.handleEvent.call(fn, e); } };
    }
    return fn;
  }

  function isShotEvent(e) {
    try {
      if (!e) return false;
      const k = e.key;
      return k === 'PrintScreen' || k === 'F13' ||
        ((k === 's' || k === 'S') && e.shiftKey && (e.ctrlKey || e.metaKey));
    } catch { return false; }
  }

  /** Neutralize window.onblur = fn / document.onvisibilitychange = fn style handlers. */
  function applyOnProps(on) {
    for (const { base, prop, desc } of ON_BASES) {
      try {
        if (on) {
          Object.defineProperty(base, prop, {
            configurable: true,
            get() { return null; },
            set() { /* swallowed */ },
          });
        } else if (desc) {
          Object.defineProperty(base, prop, desc);
        }
      } catch { /* ignore */ }
    }
  }

  /** document.hidden=false, visibilityState='visible', hasFocus()=true. */
  function spoofDocument(on) {
    const defs = on ? {
      hidden: { get: () => false, configurable: true },
      visibilityState: { get: () => 'visible', configurable: true },
      webkitVisibilityState: PRIO.webkitVisibilityState
        ? { get: () => 'visible', configurable: true } : null,
      hasFocus: { value: () => true, writable: true, configurable: true },
    } : {
      hidden: PRIO.hidden,
      visibilityState: PRIO.visibilityState,
      webkitVisibilityState: PRIO.webkitVisibilityState,
      hasFocus: PRIO.hasFocus,
    };

    // Both prototype (standard lookup) and instance (in case the page defines
    // its own property later — we re-pin periodically too).
    for (const target of [Document.prototype, document]) {
      for (const [k, d] of Object.entries(defs)) {
        try {
          if (!d) { delete target[k]; continue; }
          Object.defineProperty(target, k, d);
        } catch { /* ignore */ }
      }
    }
  }

  /** CSS blur scrubber — watches class/style churn on <html>/<body>. */
  let cssObserver = null;

  function applyCssGuard(on) {
    if (on) {
      if (cssObserver) return;
      const mo = new MutationObserver((muts) => {
        if (!state.bypass || realFocused) return;
        for (const m of muts) {
          const el = m.target;
          if (!(el instanceof Element)) continue;
          if (m.attributeName === 'class') {
            const oldTokens = new Set(String(m.oldValue || '').split(/\s+/));
            const added = String(el.getAttribute('class') || '').split(/\s+/)
              .filter((t) => t && !oldTokens.has(t) && /blur/i.test(t) && !/blurhash/i.test(t));
            if (added.length) { try { el.classList.remove(...added); } catch { /* ignore */ } }
          } else if (
            m.attributeName === 'style' &&
            /blur\s*\(/i.test(String(el.getAttribute('style') || '')) &&
            !/blur\s*\(/i.test(String(m.oldValue || ''))
          ) {
            el.setAttribute('style', m.oldValue || '');
          }
        }
      });
      const opts = { attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true };
      mo.observe(document.documentElement, opts);
      if (document.body) mo.observe(document.body, opts);
      else {
        rawAddEL.call(document, 'DOMContentLoaded',
          () => { if (document.body) mo.observe(document.body, opts); },
          { once: true });
      }
      cssObserver = mo;
    } else if (cssObserver) {
      cssObserver.disconnect();
      cssObserver = null;
    }
  }

  /** One-shot + periodic cleanup of blur styling while truly unfocused. */
  function scrubBlurNow() {
    if (!state.bypass) return;
    for (const el of [document.documentElement, document.body]) {
      if (!(el instanceof Element)) continue;
      const tokens = (el.getAttribute('class') || '').split(/\s+/)
        .filter((t) => t && /blur/i.test(t) && !/blurhash/i.test(t));
      if (tokens.length) { try { el.classList.remove(...tokens); } catch { /* ignore */ } }
      const style = el.getAttribute('style');
      if (style && /blur\s*\(/i.test(style)) {
        el.setAttribute('style', style.replace(/\bfilter\s*:\s*[^;]*blur\s*\([^;]*\)\s*;?/gi, ''));
      }
    }
  }

  function repinDocument() {
    // Re-assert on the instance in case the page redefines its own props.
    try { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); } catch { /* ignore */ }
    try { Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true }); } catch { /* ignore */ }
    try { Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true }); } catch { /* ignore */ }
    try { Object.defineProperty(document, 'hasFocus', { value: () => true, writable: true, configurable: true }); } catch { /* ignore */ }
  }

  let pulseTimer = 0;

  function applyPulse(on) {
    if (on) {
      if (pulseTimer) return;
      pulseTimer = setInterval(() => {
        if (!state.bypass) return;
        if (!realFocused) scrubBlurNow();
        repinDocument();
      }, 500);
    } else if (pulseTimer) {
      clearInterval(pulseTimer);
      pulseTimer = 0;
    }
  }

  function applyBypass(on) {
    EventTarget.prototype.addEventListener = on ? patchedAddEL : rawAddEL;
    applyOnProps(on);
    spoofDocument(on);
    applyCssGuard(on);
    applyPulse(on);
    if (on) { scrubBlurNow(); repinDocument(); }
  }

  // ---------------------------------------------------------------------
  // 8. Toast UI (closed shadow root — immune to page CSS)
  // ---------------------------------------------------------------------
  let toastRoot = null, toastBox = null, toastText = null, toastTimer = 0;

  function mountToast() {
    if (toastRoot && toastRoot.isConnected) return;
    if (!document.documentElement) return;
    toastRoot = document.createElement('div');
    toastRoot.dataset.swaToast = '';
    const sh = toastRoot.attachShadow({ mode: 'closed' });
    const st = document.createElement('style');
    st.textContent = `
      :host{all:initial}
      .t{position:fixed;right:16px;bottom:16px;z-index:2147483647;background:rgba(18,18,20,.92);
         color:#f2f2f2;font:12.5px system-ui,sans-serif;padding:10px 14px;border-radius:10px;
         box-shadow:0 6px 24px rgba(0,0,0,.4);opacity:0;transform:translateY(8px);
         transition:.18s;pointer-events:none;max-width:320px}
      .t.show{opacity:1;transform:none}`;
    toastBox = document.createElement('div');
    toastBox.className = 't';
    toastText = document.createElement('span');
    toastBox.appendChild(toastText);
    sh.append(st, toastBox);
    document.documentElement.appendChild(toastRoot);
  }

  function toast(msg) {
    try {
      mountToast();
      if (!toastBox) return;
      toastText.textContent = msg;
      toastBox.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastBox.classList.remove('show'), 2600);
    } catch { /* ignore */ }
  }

  // <body>/<html> may not exist yet at document_start — mount when available.
  try { new MutationObserver(() => mountToast()).observe(document, { childList: true }); } catch { /* ignore */ }
  mountToast();

  // ---------------------------------------------------------------------
  // 9. Boot — apply bypass immediately so page scripts inherit it.
  // ---------------------------------------------------------------------
  applyBypass(true);
  console.info(
    '%c' + TAG + ' loaded (MAIN world, document_start) — screenshot bypass ON',
    'color:#191919;background:#fffc00;padding:1px 5px;border-radius:3px;font-weight:600'
  );
})();

