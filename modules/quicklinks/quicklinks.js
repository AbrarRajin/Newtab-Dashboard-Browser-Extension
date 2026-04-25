// ─── Quick Links Module ────────────────────────────────────────────────────
// Hierarchy: Category → Folder → Link
// Right-click links   → Edit / Delete
// Right-click folder  → Add Link / Rename / Delete
// Right-click cat tab → Rename / Delete
// ─────────────────────────────────────────────────────────────────────────

const QL_STORE = 'quicklinks_v1';
const QL_FAV_CACHE = 'ql_favicon_cache';
const QL_CSS_KEY = 'ql_custom_css';
const QL_NEWTAB_KEY = 'ql_open_newtab';

const qlUid = () => Math.random().toString(36).slice(2, 9);
const qlFav = url => { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; } catch { return ''; } };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function qlGet() {
  return new Promise(r => {
    try { chrome.storage.local.get(QL_STORE, d => r(d[QL_STORE] ?? null)); }
    catch { try { r(JSON.parse(localStorage.getItem(QL_STORE))); } catch { r(null); } }
  });
}
function qlSet(v) {
  return new Promise(r => {
    try { chrome.storage.local.set({ [QL_STORE]: v }, r); }
    catch { localStorage.setItem(QL_STORE, JSON.stringify(v)); r(); }
  });
}

// Generic key/value helpers (used for CSS and other per-key settings)
function _qlKvGet(key) {
  return new Promise(r => {
    try { chrome.storage.local.get(key, d => r(d[key] ?? null)); }
    catch { try { r(localStorage.getItem(key)); } catch { r(null); } }
  });
}
function _qlKvSet(key, val) {
  return new Promise(r => {
    try { chrome.storage.local.set({ [key]: val }, r); }
    catch { localStorage.setItem(key, val); r(); }
  });
}

// ─── Custom CSS injection ──────────────────────────────────────────────────
function applyCustomCSS(css) {
  let tag = document.getElementById('ql-custom-style');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'ql-custom-style';
    document.head.appendChild(tag);
  }
  tag.textContent = css || '';
}

// ─── Favicon cache (persisted, keyed by icon URL) ─────────────────────────
let _qlFavCache = null; // null = not yet loaded

function _qlFavCacheGet() {
  return new Promise(r => {
    try { chrome.storage.local.get(QL_FAV_CACHE, d => r(d[QL_FAV_CACHE] ?? {})); }
    catch { try { r(JSON.parse(localStorage.getItem(QL_FAV_CACHE)) ?? {}); } catch { r({}); } }
  });
}
function _qlFavCacheSet(cache) {
  return new Promise(r => {
    try { chrome.storage.local.set({ [QL_FAV_CACHE]: cache }, r); }
    catch { localStorage.setItem(QL_FAV_CACHE, JSON.stringify(cache)); r(); }
  });
}

async function qlFavCacheInit() {
  if (_qlFavCache) return;
  _qlFavCache = await _qlFavCacheGet();
}

// Returns cached data URL synchronously, or the original URL as fallback.
function qlFavSync(iconUrl) {
  if (!iconUrl) return '';
  return _qlFavCache?.[iconUrl] ?? iconUrl;
}

// Fetches iconUrl, caches it as a data URL, then updates imgEl.src.
// No-ops if already cached (qlFavSync already handled it in the HTML).
async function qlFavEnsureCached(iconUrl, imgEl) {
  if (!iconUrl || !imgEl || _qlFavCache?.[iconUrl]) return;
  try {
    const resp = await fetch(iconUrl);
    if (!resp.ok) return;
    const blob = await resp.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    if (_qlFavCache) _qlFavCache[iconUrl] = dataUrl;
    await _qlFavCacheSet(_qlFavCache);
    if (imgEl.isConnected) imgEl.src = dataUrl;
  } catch {
    // keep the original URL already in img.src
  }
}

// ─── Embedded CSS ─────────────────────────────────────────────────────────
const QL_CSS = `
/* ── Root ─────────────────────────────────────────── */
#ql-root {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;  
  gap: 16px;
  padding: 8px 0;
}

/* ── Category bar ─────────────────────────────────── */
#ql-catbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.2);
  padding: 4px;
  box-sizing: border-box;
}

.ql-cat {
  padding: 0.38rem 1rem;
  background: transparent;
  border: none;
  border-radius: 999px;
  color: rgba(255,255,255,0.7);
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
  font-family: inherit;
  white-space: nowrap;
  user-select: none;
}
.ql-cat:hover:not(.ql-cat-on) {
  color: rgba(255,255,255,0.95);
}
.ql-cat-on {
  background: rgba(255,255,255,0.92);
  color: #374151;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
}
.ql-cat-add {
  padding: 0.38rem 0.75rem;
  background: none;
  border: none;
  border-radius: 999px;
  color: rgba(255,255,255,0.35);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
  font-family: inherit;
}
.ql-cat-add:hover {
  color: rgba(255,255,255,0.75);
  background: rgba(255,255,255,0.08);
}

/* ── Body ─────────────────────────────────────────── */
#ql-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.ql-empty {
  text-align: center;
  padding: 28px 0;
  opacity: 0.3;
  font-size: 0.83rem;
  font-family: sans-serif;
}

/* ── Folder ──────────────────────────────────────── */
.ql-folder { display: flex; flex-direction: column; gap: 10px; }

.ql-folder-name {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.35;
  font-family: sans-serif;
  user-select: none;
  cursor: default;
  transition: opacity 0.14s;
}
.ql-folder-name:hover { opacity: 0.6; }

/* ── Links row ───────────────────────────────────── */
.ql-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center; 
  gap: 10px;
  align-items: flex-start;
}

.ql-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 70px;
  text-decoration: none;
  color: #fff;
  border-radius: 12px;
  padding: 6px 4px;
  cursor: pointer;
  transition: background 0.13s;
  -webkit-user-drag: none;
}
.ql-link:hover { background: rgba(255,255,255,0.07); }

/* ── Icon ─────────────────────────────────────────── */
.ql-icon {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 1.4rem;
  flex-shrink: 0;
}
.ql-icon img { width: 50px; height: 50px; object-fit: contain; }

/* Hover: scale + icon lift ──────────────────────── */
.ql-link {
  transition: background 0.13s, transform 0.18s ease;
}
.ql-link:hover {
  background: rgba(255,255,255,0.07);
  transform: translateY(-2px);
}
.ql-link:active {
  transform: translateY(0px);
  transition-duration: 0.08s;
}

.ql-icon img {
  transition: filter 0.18s ease;
}
.ql-link:hover .ql-icon img {
  filter: brightness(1.12) drop-shadow(0 2px 6px rgba(255,255,255,0.12));
}

.ql-lbl {
  font-size: 0.66rem;
  text-align: center;
  line-height: 1.3;
  word-break: break-word;
  max-width: 70px;
  font-family: sans-serif;
  opacity: 0.82;
}

/* ── Add placeholder ─────────────────────────────── */
.ql-add-ph {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 70px;
  cursor: pointer;
  border-radius: 12px;
  padding: 6px 4px;
  transition: background 0.13s;
}
.ql-add-ph:hover { background: rgba(255,255,255,0.04); }
.ql-add-ph:hover .ql-add-box {
  border-color: rgba(255,255,255,0.38);
  color: rgba(255,255,255,0.6);
}
.ql-add-box {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  border: 1.5px dashed rgba(255,255,255,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: rgba(255,255,255,0.22);
  transition: all 0.14s;
}

/* ── Link drag placeholder ───────────────────────── */
.ql-drag-ph {
  border: 2px dashed rgba(79,142,247,0.45);
  border-radius: 12px;
  background: rgba(79,142,247,0.07);
  flex-shrink: 0;
}

/* ── Context menu ────────────────────────────────── */
.ql-ctx {
  position: fixed;
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 5px;
  min-width: 168px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.65);
  z-index: 9999;
  display: none;
  font-family: sans-serif;
}
.ql-ctx.open { display: block; }
.ql-ctx-item {
  padding: 8px 12px;
  font-size: 0.81rem;
  color: rgba(255,255,255,0.85);
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}
.ql-ctx-item:hover { background: rgba(255,255,255,0.1); }
.ql-ctx-item.danger { color: #ff8080; }
.ql-ctx-item.danger:hover { background: rgba(255,80,80,0.15); }
.ql-ctx-sep { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0; }

/* ── Modal ───────────────────────────────────────── */
#ql-modal-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 10000;
  display: none;
  align-items: center;
  justify-content: center;
}
#ql-modal-wrap.open { display: flex; }

.ql-modal {
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
  padding: 1.5rem;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7);
}
.ql-modal h3 { margin: 0; font-size: 0.95rem; font-weight: 600; color: #fff; font-family: sans-serif; }

.ql-mfield { display: flex; flex-direction: column; gap: 5px; }
.ql-mfield label {
  font-size: 0.69rem;
  color: rgba(255,255,255,0.38);
  font-family: sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ql-minput {
  background: #111;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  color: #fff;
  font-size: 0.83rem;
  padding: 8px 10px;
  outline: none;
  transition: border-color 0.18s;
  width: 100%;
  box-sizing: border-box;
  font-family: sans-serif;
}
.ql-minput:focus { border-color: rgba(255,255,255,0.35); }

.ql-mprev {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  padding: 8px 10px;
}
.ql-mprev-icon {
  width: 38px; height: 38px;
  border-radius: 10px;
  background: rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; flex-shrink: 0;
}
.ql-mprev-icon img { width: 28px; height: 28px; object-fit: contain; }
.ql-mprev-name {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.75);
  font-family: sans-serif;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.ql-mactions { display: flex; gap: 8px; }
.ql-mbtn {
  flex: 1; padding: 9px; border: none; border-radius: 8px;
  font-size: 0.82rem; font-weight: 600; cursor: pointer;
  transition: opacity 0.14s; font-family: sans-serif;
}
.ql-mbtn:hover { opacity: 0.85; }
.ql-mbtn-p { background: #4f8ef7; color: #fff; }
.ql-mbtn-s { background: rgba(255,255,255,0.08); color: #fff; }

/* ── Catbar settings button ───────────────────────── */
.ql-settings-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.22);
  font-size: 0.88rem;
  cursor: pointer;
  padding: 0.38rem 0.6rem;
  border-radius: 999px;
  transition: color 0.15s ease, background 0.15s ease;
  line-height: 1;
  margin-left: 2px;
  font-family: inherit;
}
.ql-settings-btn:hover {
  color: rgba(255,255,255,0.75);
  background: rgba(255,255,255,0.08);
}

/* ── Settings panel ───────────────────────────────── */
#ql-settings-panel {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
  font-family: sans-serif;
}
.ql-sp-header {
  display: flex;
  align-items: center;
}
.ql-sp-title {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
  color: #fff;
}
.ql-sp-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ql-sp-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.8rem;
  opacity: 0.8;
  color: #fff;
}
.ql-sp-textarea {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 8px;
  color: #7dd3a8;
  font-size: 0.77rem;
  padding: 8px 10px;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  resize: vertical;
  min-height: 140px;
  font-family: 'Courier New', monospace;
  line-height: 1.5;
  transition: border-color 0.2s;
}
.ql-sp-textarea:focus { border-color: rgba(255,255,255,0.35); }
.ql-sp-note {
  font-size: 0.67rem;
  opacity: 0.38;
  line-height: 1.5;
}
.ql-sp-note code {
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  padding: 0 3px;
  font-size: 0.9em;
}
.ql-sp-actions { display: flex; gap: 8px; }

/* ── Settings toggle ──────────────────────────────── */
.ql-sp-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  cursor: pointer;
  color: #fff;
  font-size: 0.82rem;
  opacity: 0.85;
  user-select: none;
}
.ql-sp-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}
.ql-sp-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.ql-sp-toggle-track {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.12);
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.15);
  transition: background 0.2s, border-color 0.2s;
  cursor: pointer;
}
.ql-sp-toggle-track::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255,255,255,0.4);
  transition: left 0.18s ease, background 0.2s;
}
.ql-sp-toggle input:checked + .ql-sp-toggle-track {
  background: #4f8ef7;
  border-color: #4f8ef7;
}
.ql-sp-toggle input:checked + .ql-sp-toggle-track::after {
  left: calc(100% - 16px);
  background: #fff;
}
`;

// ─── Link drag-to-reorder ─────────────────────────────────────────────────
// Singleton state — only one link can be dragged at a time across all rows.

let _qlDrag = null;

function _qlGlobalDragInit() {
  if (_qlGlobalDragInit._done) return;
  _qlGlobalDragInit._done = true;

  document.addEventListener('mousemove', e => {
    if (!_qlDrag) return;
    const s = _qlDrag;

    if (!s.active) {
      if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 6) return;
      s.active = true;

      // Placeholder keeps the gap
      const r = s.el.getBoundingClientRect();
      s.ph = document.createElement('div');
      s.ph.className = 'ql-drag-ph';
      s.ph.style.width  = s.el.offsetWidth  + 'px';
      s.ph.style.height = s.el.offsetHeight + 'px';
      s.el.after(s.ph);

      // Floating clone
      s.clone = s.el.cloneNode(true);
      Object.assign(s.clone.style, {
        position: 'fixed', pointerEvents: 'none', zIndex: '9999',
        width: r.width + 'px', left: r.left + 'px', top: r.top + 'px',
        opacity: '0.88', transform: 'scale(1.07)', transition: 'none',
        borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      });
      document.body.appendChild(s.clone);
      s.el.style.opacity = '0';
    }

    s.clone.style.left = (e.clientX - s.ox) + 'px';
    s.clone.style.top  = (e.clientY - s.oy) + 'px';
    _qlMovePh(s.row, s.ph, s.el, e.clientX, e.clientY);
  });

  document.addEventListener('mouseup', () => {
    if (!_qlDrag) return;
    const s = _qlDrag;
    _qlDrag = null;
    if (!s.active) return;

    // Prevent the click that follows mouseup from navigating
    s.el.addEventListener('click', e => e.preventDefault(), { once: true });

    const addPh = s.row.querySelector('.ql-add-ph');
    const slots  = [...s.row.children].filter(el => el !== addPh);
    const newIdx = slots.indexOf(s.ph);

    s.ph.remove();
    s.clone.remove();
    s.el.style.opacity = '';

    if (newIdx === -1) return;
    const oldIdx = s.folder.links.findIndex(l => l.id === s.el.dataset.lid);
    if (oldIdx === -1 || oldIdx === newIdx) return;

    const [link] = s.folder.links.splice(oldIdx, 1);
    s.folder.links.splice(newIdx, 0, link);
    s.save();
    s.redraw();
  });
}

function _qlMovePh(row, ph, dragEl, mx, my) {
  const addPh = row.querySelector('.ql-add-ph');
  const items  = [...row.children].filter(el => el !== ph && el !== dragEl && el !== addPh);
  let target   = addPh;
  for (const item of items) {
    const r = item.getBoundingClientRect();
    if (my < r.top + r.height / 2) { target = item; break; }
    if (my < r.bottom && mx < r.left + r.width / 2) { target = item; break; }
  }
  if (ph.nextSibling !== target) row.insertBefore(ph, target);
}

function _qlInitRowDrag(row, folder, save, redraw) {
  _qlGlobalDragInit();
  row.addEventListener('mousedown', e => {
    const link = e.target.closest('.ql-link');
    if (!link) return;
    e.preventDefault(); // suppress browser native drag & text-select
    const r = link.getBoundingClientRect();
    _qlDrag = {
      el: link, row, folder, save, redraw,
      x0: e.clientX, y0: e.clientY,
      ox: e.clientX - r.left, oy: e.clientY - r.top,
      active: false, ph: null, clone: null,
    };
  });
}

// ─── Settings panel ────────────────────────────────────────────────────────
async function showSettings(el) {
  const [css, savedNewtab] = await Promise.all([_qlKvGet(QL_CSS_KEY), _qlKvGet(QL_NEWTAB_KEY)]);
  const newtabOn = savedNewtab === true || savedNewtab === 'true';

  el.innerHTML = `
    <div id="ql-settings-panel">
      <div class="ql-sp-header">
        <span class="ql-sp-title">⚙ Quick Links — Settings</span>
      </div>
      <div class="ql-sp-body">
        <label class="ql-sp-toggle-row">
          <span>Open links in new tab</span>
          <span class="ql-sp-toggle">
            <input type="checkbox" id="ql-sp-newtab"${newtabOn ? ' checked' : ''}>
            <span class="ql-sp-toggle-track"></span>
          </span>
        </label>
        <label class="ql-sp-label">Custom CSS
          <textarea class="ql-sp-textarea" id="ql-sp-css" spellcheck="false"
            placeholder="#ql-catbar { background: rgba(30,20,60,0.8); }"
          >${esc(css || '')}</textarea>
          <span class="ql-sp-note">
            Target <code>#ql-root</code>, <code>#ql-catbar</code>, <code>#ql-body</code>,
            <code>.ql-cat</code>, <code>.ql-cat-on</code>, <code>.ql-folder</code>,
            <code>.ql-folder-name</code>, <code>.ql-link</code>, <code>.ql-icon</code>,
            <code>.ql-lbl</code>, <code>.ql-add-box</code>
          </span>
        </label>
        <div class="ql-sp-actions">
          <button class="ql-mbtn ql-mbtn-p" id="ql-sp-save">Save</button>
          <button class="ql-mbtn ql-mbtn-s" id="ql-sp-cancel">Cancel</button>
        </div>
      </div>
    </div>`;

  document.getElementById('ql-sp-save')?.addEventListener('click', async () => {
    const newCss = document.getElementById('ql-sp-css')?.value ?? '';
    const newNewtab = document.getElementById('ql-sp-newtab')?.checked ?? false;
    await Promise.all([
      _qlKvSet(QL_CSS_KEY, newCss),
      _qlKvSet(QL_NEWTAB_KEY, newNewtab),
    ]);
    applyCustomCSS(newCss);
    initQuicklinks(el);
  });

  document.getElementById('ql-sp-cancel')?.addEventListener('click', () => initQuicklinks(el));
}

// ─── Module entry point ────────────────────────────────────────────────────
export async function initQuicklinks(el) {
  await qlFavCacheInit();
  const [savedCss, savedNewtab] = await Promise.all([_qlKvGet(QL_CSS_KEY), _qlKvGet(QL_NEWTAB_KEY)]);
  if (savedCss) applyCustomCSS(savedCss);
  const openInNewTab = savedNewtab === true || savedNewtab === 'true';
  let data = await qlGet() ?? { activeId: null, cats: [] };
  if (!data.cats.find(c => c.id === data.activeId))
    data.activeId = data.cats[0]?.id ?? null;

  // Inject styles once
  if (!document.getElementById('ql-css')) {
    const s = Object.assign(document.createElement('style'), { id: 'ql-css', textContent: QL_CSS });
    document.head.appendChild(s);
  }

  el.innerHTML = `
    <div id="ql-root">
      <div id="ql-body"></div>
      <div id="ql-catbar"></div>
    </div>
    <div class="ql-ctx" id="ql-ctx"></div>
    <div id="ql-modal-wrap"></div>`;

  const ctxEl = document.getElementById('ql-ctx');
  const modalWrap = document.getElementById('ql-modal-wrap');

  const save = () => qlSet(data);
  const activeCat = () => data.cats.find(c => c.id === data.activeId);

  // ── Draw ──────────────────────────────────────────────────────────────

  function draw() { drawCatbar(); drawBody(); }

  function drawCatbar() {
    const bar = document.getElementById('ql-catbar');
    if (!bar) return;
    bar.innerHTML =
      data.cats.map(c =>
        `<button class="ql-cat${c.id === data.activeId ? ' ql-cat-on' : ''}" data-id="${c.id}">${esc(c.name)}</button>`
      ).join('') +
      `<button class="ql-cat-add" id="ql-cat-add"> ＋ </button>` +
      `<button class="ql-settings-btn" id="ql-settings-btn" title="Settings">⚙</button>`;

    bar.querySelectorAll('.ql-cat').forEach(btn => {
      btn.addEventListener('click', () => { data.activeId = btn.dataset.id; save(); drawCatbar(); drawBody(); });
      btn.addEventListener('contextmenu', e => { e.preventDefault(); catCtx(e, btn.dataset.id); });
    });
    document.getElementById('ql-cat-add')?.addEventListener('click', () => openModal({ type: 'cat' }));
    document.getElementById('ql-settings-btn')?.addEventListener('click', () => showSettings(el));
  }

  function drawBody() {
    const body = document.getElementById('ql-body');
    if (!body) return;
    const cat = activeCat();

    if (!cat) {
      body.innerHTML = `<div class="ql-empty">No category selected — add one below ↓</div>`;
      return;
    }

    body.innerHTML =
      cat.folders.map(f => `
        <div class="ql-folder" data-fid="${f.id}">
          <span class="ql-folder-name" data-fid="${f.id}">${esc(f.name)}</span>
          <div class="ql-links" data-fid="${f.id}">
            ${f.links.map(l => linkHtml(l, f.id)).join('')}
            <div class="ql-add-ph" data-fid="${f.id}">
              <div class="ql-add-box">＋</div>
              <span class="ql-lbl" style="opacity:.28">Add</span>
            </div>
          </div>
        </div>`
      ).join('');

    // Cache any icons not yet stored
    body.querySelectorAll('.ql-link').forEach(a => {
      const img = a.querySelector('.ql-icon img');
      if (img && a.dataset.icon) qlFavEnsureCached(a.dataset.icon, img);
    });

    // Link clicks & right-clicks
    body.querySelectorAll('.ql-link').forEach(a => {
      a.addEventListener('contextmenu', e => {
        e.preventDefault();
        linkCtx(e, a.dataset.fid, a.dataset.lid);
      });
    });

    // Folder name right-click
    body.querySelectorAll('.ql-folder-name').forEach(span =>
      span.addEventListener('contextmenu', e => { e.preventDefault(); folderCtx(e, span.dataset.fid); })
    );

    // Add-link placeholder
    body.querySelectorAll('.ql-add-ph').forEach(div =>
      div.addEventListener('click', () => openModal({ type: 'link', catId: cat.id, folderId: div.dataset.fid }))
    );

    // Drag-to-reorder links within each folder row
    body.querySelectorAll('.ql-links').forEach(row => {
      const folder = cat.folders.find(f => f.id === row.dataset.fid);
      if (folder) _qlInitRowDrag(row, folder, save, drawBody);
    });
  }

  function linkHtml(l, fid) {
    const iconUrl = l.iconUrl || qlFav(l.url);
    const src = qlFavSync(iconUrl); // cached data URL or original URL
    const target = openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a class="ql-link" data-lid="${l.id}" data-fid="${fid}" data-url="${esc(l.url)}" data-icon="${esc(iconUrl)}" href="${esc(l.url)}" title="${esc(l.title)}"${target}>
      <div class="ql-icon"><img src="${esc(src)}" onerror="this.parentElement.textContent='🔗'" alt=""></div>
      <span class="ql-lbl">${esc(l.title)}</span>
    </a>`;
  }

  // ── Context menu ───────────────────────────────────────────────────────

  let iH = {}; // action handlers

  function openCtx(e, items) {
    ctxEl.innerHTML = items.map(i =>
      i.sep ? `<div class="ql-ctx-sep"></div>`
        : `<div class="ql-ctx-item${i.danger ? ' danger' : ''}" data-a="${i.a}">${i.label}</div>`
    ).join('');

    ctxEl.style.cssText = `left:${e.clientX}px;top:${e.clientY}px`;
    ctxEl.classList.add('open');

    // Clamp to viewport
    requestAnimationFrame(() => {
      const r = ctxEl.getBoundingClientRect();
      if (r.right > innerWidth) ctxEl.style.left = (innerWidth - r.width - 8) + 'px';
      if (r.bottom > innerHeight) ctxEl.style.top = (innerHeight - r.height - 8) + 'px';
    });

    ctxEl.querySelectorAll('.ql-ctx-item').forEach(el =>
      el.addEventListener('click', ev => { ev.stopPropagation(); iH[el.dataset.a]?.(); closeCtx(); })
    );
    setTimeout(() => document.addEventListener('click', closeCtx, { once: true }), 0);
  }

  function closeCtx() { ctxEl.classList.remove('open'); }

  function linkCtx(e, fid, lid) {
    iH = {
      edit: () => {
        const cat = activeCat(), f = cat?.folders.find(f => f.id === fid), l = f?.links.find(l => l.id === lid);
        if (l) openModal({ type: 'link', catId: cat.id, folderId: fid, edit: l });
      },
      del: () => {
        const cat = activeCat(), f = cat?.folders.find(f => f.id === fid);
        if (f) { f.links = f.links.filter(l => l.id !== lid); save(); drawBody(); }
      }
    };
    openCtx(e, [
      { label: '✏️  Edit Link', a: 'edit' },
      { sep: true },
      { label: '🗑  Delete Link', a: 'del', danger: true }
    ]);
  }

  function folderCtx(e, fid) {
    const cat = activeCat();
    iH = {
      addlnk: () => openModal({ type: 'link', catId: cat?.id, folderId: fid }),
      rename: () => { const f = cat?.folders.find(f => f.id === fid); if (f) openModal({ type: 'folder', catId: cat.id, edit: f }); },
      del: () => { if (cat) { cat.folders = cat.folders.filter(f => f.id !== fid); save(); drawBody(); } }
    };
    openCtx(e, [
      { label: '＋  Add Link', a: 'addlnk' },
      { label: '✏️  Rename Folder', a: 'rename' },
      { sep: true },
      { label: '🗑  Delete Folder', a: 'del', danger: true }
    ]);
  }

  function catCtx(e, catId) {
    iH = {
      addfolder: () => openModal({ type: 'folder', catId }),
      rename: () => { const c = data.cats.find(c => c.id === catId); if (c) openModal({ type: 'cat', edit: c }); },
      del: () => {
        data.cats = data.cats.filter(c => c.id !== catId);
        if (data.activeId === catId) data.activeId = data.cats[0]?.id ?? null;
        save(); draw();
      }
    };
    openCtx(e, [
      { label: '＋  Add Folder', a: 'addfolder' },
      { label: '✏️  Rename', a: 'rename' },
      { sep: true },
      { label: '🗑  Delete Category', a: 'del', danger: true }
    ]);
  }

  // ── Modal ──────────────────────────────────────────────────────────────

  function openModal(opts) {
    const { type, edit } = opts;
    let body = '';

    if (type === 'link') {
      const l = edit;
      body = `
        <h3>${l ? 'Edit' : 'Add'} Link</h3>
        <div class="ql-mfield">
          <label>Title</label>
          <input class="ql-minput" id="m-title" placeholder="YouTube" value="${esc(l?.title || '')}">
        </div>
        <div class="ql-mfield">
          <label>URL</label>
          <input class="ql-minput" id="m-url" placeholder="https://youtube.com" value="${esc(l?.url || '')}">
        </div>
        <div class="ql-mfield">
          <label>Icon URL <span style="opacity:.38;text-transform:none;letter-spacing:0">(optional — auto if blank)</span></label>
          <input class="ql-minput" id="m-icon" placeholder="Leave blank for auto-detect" value="${esc(l?.iconUrl || '')}">
        </div>
        <div class="ql-mprev" id="m-prev" style="display:none">
          <div class="ql-mprev-icon"><img id="m-pimg" src="" alt=""></div>
          <span class="ql-mprev-name" id="m-pname"></span>
        </div>`;
    } else if (type === 'folder') {
      body = `
        <h3>${edit ? 'Rename' : 'Add'} Folder</h3>
        <div class="ql-mfield">
          <label>Name</label>
          <input class="ql-minput" id="m-name" placeholder="My Folder" value="${esc(edit?.name || '')}">
        </div>`;
    } else {
      body = `
        <h3>${edit ? 'Rename' : 'Add'} Category</h3>
        <div class="ql-mfield">
          <label>Name</label>
          <input class="ql-minput" id="m-name" placeholder="SOCIALS" value="${esc(edit?.name || '')}">
        </div>`;
    }

    modalWrap.innerHTML = `
      <div class="ql-modal">
        ${body}
        <div class="ql-mactions">
          <button class="ql-mbtn ql-mbtn-p" id="m-save">Save</button>
          <button class="ql-mbtn ql-mbtn-s" id="m-cancel">Cancel</button>
        </div>
      </div>`;
    modalWrap.classList.add('open');
    setTimeout(() => modalWrap.querySelector('.ql-minput')?.focus(), 30);

    // Live icon/title preview for link type
    if (type === 'link') {
      const upd = () => {
        const url = document.getElementById('m-url')?.value.trim();
        const icon = document.getElementById('m-icon')?.value.trim() || qlFav(url || '');
        const title = document.getElementById('m-title')?.value.trim();
        const prev = document.getElementById('m-prev');
        if (prev && (url || icon)) {
          prev.style.display = 'flex';
          document.getElementById('m-pimg').src = icon;
          document.getElementById('m-pname').textContent = title || url || '';
        }
      };
      ['m-url', 'm-icon', 'm-title'].forEach(id => document.getElementById(id)?.addEventListener('input', upd));
      if (edit) upd();
    }

    // Save logic
    document.getElementById('m-save')?.addEventListener('click', () => {
      if (type === 'link') {
        let url = document.getElementById('m-url')?.value.trim();
        if (!url) { document.getElementById('m-url')?.focus(); return; }
        if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) url = 'https://' + url;
        let title = document.getElementById('m-title')?.value.trim();
        if (!title) { try { title = new URL(url).hostname; } catch { title = url; } }
        const iconUrl = document.getElementById('m-icon')?.value.trim() || '';
        const cat = data.cats.find(c => c.id === opts.catId);
        const folder = cat?.folders.find(f => f.id === opts.folderId);
        if (!folder) return;
        if (edit) {
          const lnk = folder.links.find(l => l.id === edit.id);
          if (lnk) Object.assign(lnk, { title, url, iconUrl });
        } else {
          folder.links.push({ id: qlUid(), title, url, iconUrl });
        }
        save(); closeModal(); drawBody();

      } else if (type === 'folder') {
        const name = document.getElementById('m-name')?.value.trim();
        if (!name) { document.getElementById('m-name')?.focus(); return; }
        const cat = data.cats.find(c => c.id === opts.catId);
        if (!cat) return;
        if (edit) {
          const f = cat.folders.find(f => f.id === edit.id);
          if (f) f.name = name;
        } else {
          cat.folders.push({ id: qlUid(), name, links: [] });
        }
        save(); closeModal(); drawBody();

      } else {
        const name = document.getElementById('m-name')?.value.trim().toUpperCase();
        if (!name) { document.getElementById('m-name')?.focus(); return; }
        if (edit) {
          const c = data.cats.find(c => c.id === edit.id);
          if (c) c.name = name;
        } else {
          const nc = { id: qlUid(), name, folders: [] };
          data.cats.push(nc);
          data.activeId = nc.id;
        }
        save(); closeModal(); draw();
      }
    });

    document.getElementById('m-cancel')?.addEventListener('click', closeModal);
    modalWrap.addEventListener('click', e => { if (e.target === modalWrap) closeModal(); });
    modalWrap.querySelectorAll('.ql-minput').forEach(inp =>
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('m-save')?.click(); })
    );
  }

  function closeModal() { modalWrap.classList.remove('open'); modalWrap.innerHTML = ''; }

  draw();
}