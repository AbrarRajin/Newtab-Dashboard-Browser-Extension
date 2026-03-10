import { exportSettings, importSettings } from "../settings/settings.js";

// ── Background Module ─────────────────────────────────────────────────────
// Stores the image as a base64 DataURL so it never needs re-downloading.
// Falls back to storing the raw URL when fetching fails (e.g. CORS).
// Background is rendered on a dedicated #bg-blur-layer so blur never
// affects page widgets or overlays.
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bg_settings';  // { data, fit, dim, blur, sourceUrl, sourceType }

// ── Storage helpers ───────────────────────────────────────────────────────

function storeGet(key) {
    return new Promise(res => {
        try { chrome.storage.local.get(key, d => res(d[key] ?? null)); }
        catch { try { res(JSON.parse(localStorage.getItem(key))); } catch { res(null); } }
    });
}

function storeSet(key, val) {
    return new Promise(res => {
        try { chrome.storage.local.set({ [key]: val }, res); }
        catch { localStorage.setItem(key, JSON.stringify(val)); res(); }
    });
}

// ── Apply background to page ──────────────────────────────────────────────
// Uses #bg-blur-layer (z-index: -2) for the image so filter:blur() never
// bleeds onto widgets. #bg-dim-overlay (z-index: -1) sits on top of it.

function applyBg(settings) {
    const overlay = document.getElementById('bg-dim-overlay');
    const layer = document.getElementById('bg-blur-layer');

    if (!settings?.data) {
        if (layer) { layer.style.backgroundImage = ''; layer.style.filter = ''; }
        if (overlay) overlay.style.opacity = 0;
        return;
    }

    const { data, fit = 'cover', dim = 0, blur = 0 } = settings;

    if (layer) {
        layer.style.backgroundImage = `url(${data})`;
        layer.style.backgroundSize = fit === 'tile' ? 'auto' : fit;
        layer.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
        layer.style.backgroundPosition = 'center';
        // Expand layer slightly so blurred edges don't show gaps
        if (blur > 0) {
            const px = blur * 2 + 'px';
            layer.style.inset = `-${px}`;
            layer.style.filter = `blur(${blur}px)`;
        } else {
            layer.style.inset = '0';
            layer.style.filter = '';
        }
    }

    if (overlay) overlay.style.opacity = dim;
}

// ── Convert URL → base64 (with CORS fallback) ─────────────────────────────

async function urlToBase64(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        return await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(blob);
        });
    } catch {
        // CORS or network issue — store raw URL, skip caching
        return url;
    }
}

// ── Convert local File → base64 ───────────────────────────────────────────

function fileToBase64(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
    });
}

// ── Module init ───────────────────────────────────────────────────────────

export async function initBackground(container) {

    // ── Inject blur layer (lowest, behind dim overlay) ───────────────────
    if (!document.getElementById('bg-blur-layer')) {
        const layer = document.createElement('div');
        layer.id = 'bg-blur-layer';
        // Styles applied here so no extra CSS file entry is strictly needed,
        // but you should also add it to background.css for clarity.
        Object.assign(layer.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '-2',
            pointerEvents: 'none',
        });
        document.body.prepend(layer);
    }

    // ── Inject dim overlay (above blur layer, still behind content) ───────
    if (!document.getElementById('bg-dim-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'bg-dim-overlay';
        document.body.prepend(overlay);
    }

    // ── Load & apply saved settings ──────────────────────────────────────
    const saved = await storeGet(STORAGE_KEY);
    applyBg(saved);

    // ── Mount HTML ────────────────────────────────────────────────────────
    container.innerHTML = `
    <link rel="stylesheet" href="modules/background/background.css">

    <button id="bg-btn" title="Background settings">📦</button>

    <div id="bg-panel">
      <div class="bg-section">
        <h3>Background</h3>

        <div class="bg-tabs">
          <button class="bg-tab active" data-tab="file">Local file</button>
          <button class="bg-tab"        data-tab="url" >Image URL</button>
        </div>

        <!-- File picker -->
        <div class="bg-tab-content" id="bg-tab-file">
          <label class="bg-file-label" id="bg-file-drop">
            <input type="file" id="bg-file-input" accept="image/*">
            <span id="bg-file-hint">Click or drop an image here</span>
          </label>
        </div>

        <!-- URL input -->
        <div class="bg-tab-content hidden" id="bg-tab-url">
          <input type="text" id="bg-url-input" placeholder="https://example.com/photo.jpg">
          <p class="bg-hint">Image will be cached locally after the first load.</p>
        </div>

        <!-- Preview strip -->
        <div id="bg-preview-wrap" class="hidden">
          <img id="bg-preview" alt="preview">
          <button id="bg-clear-preview">✕ Remove</button>
        </div>

        <p class="bg-status hidden" id="bg-status"></p>
      </div>

      <div class="bg-divider"></div>

      <div class="bg-section">
        <h3>Display</h3>
        <div class="bg-row">
          <span>Fit</span>
          <select id="bg-fit">
            <option value="cover">Cover (fill)</option>
            <option value="contain">Contain (letterbox)</option>
            <option value="tile">Tile (repeat)</option>
          </select>
        </div>
        <div class="bg-row">
          <span>Dim <span id="bg-dim-label">0%</span></span>
          <input type="range" id="bg-dim" min="0" max="0.85" step="0.05" value="0">
        </div>
        <div class="bg-row">
          <span>Blur <span id="bg-blur-label">0px</span></span>
          <input type="range" id="bg-blur" min="0" max="20" step="1" value="0">
        </div>
      </div>

      <div class="bg-divider"></div>

      <div class="bg-actions">
        <button id="bg-apply">Apply</button>
        <button id="bg-reset">Reset</button>
      </div>

      <div class="bg-divider"></div>

      <div class="bg-section">
        <h3>Settings Backup</h3>
        <div class="bg-actions">
          <button id="bg-export-settings">⬇ Export</button>
          <label class="bg-import-label">
            ⬆ Import
            <input type="file" id="bg-import-settings" accept=".json">
          </label>
        </div>
        <p class="bg-hint bg-hint--warn">⚠ Export includes API keys — keep the file private.</p>
        <p class="bg-status hidden" id="bg-backup-status"></p>
      </div>

    </div>
  `;

    // ── Element refs ──────────────────────────────────────────────────────
    const btn = document.getElementById('bg-btn');
    const panel = document.getElementById('bg-panel');
    const tabs = document.querySelectorAll('.bg-tab');
    const tabFile = document.getElementById('bg-tab-file');
    const tabUrl = document.getElementById('bg-tab-url');
    const fileInput = document.getElementById('bg-file-input');
    const fileHint = document.getElementById('bg-file-hint');
    const fileDrop = document.getElementById('bg-file-drop');
    const urlInput = document.getElementById('bg-url-input');
    const preview = document.getElementById('bg-preview');
    const previewWrap = document.getElementById('bg-preview-wrap');
    const clearPreview = document.getElementById('bg-clear-preview');
    const fitSel = document.getElementById('bg-fit');
    const dimRange = document.getElementById('bg-dim');
    const dimLabel = document.getElementById('bg-dim-label');
    const blurRange = document.getElementById('bg-blur');
    const blurLabel = document.getElementById('bg-blur-label');
    const applyBtn = document.getElementById('bg-apply');
    const resetBtn = document.getElementById('bg-reset');
    const statusEl = document.getElementById('bg-status');

    let pendingData = null;
    let activeTab = 'file';

    // ── Restore saved values into controls ───────────────────────────────
    if (saved) {
        fitSel.value = saved.fit ?? 'cover';
        dimRange.value = saved.dim ?? 0;
        dimLabel.textContent = Math.round((saved.dim ?? 0) * 100) + '%';
        blurRange.value = saved.blur ?? 0;
        blurLabel.textContent = (saved.blur ?? 0) + 'px';
        if (saved.data) {
            preview.src = saved.data;
            previewWrap.classList.remove('hidden');
            pendingData = saved.data;
            if (saved.sourceType === 'url') {
                switchTab('url');
                urlInput.value = saved.sourceUrl ?? '';
            }
        }
    }

    // ── Tab switching ─────────────────────────────────────────────────────
    function switchTab(tab) {
        activeTab = tab;
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        tabFile.classList.toggle('hidden', tab !== 'file');
        tabUrl.classList.toggle('hidden', tab !== 'url');
    }

    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    // ── File picker & drag-drop ───────────────────────────────────────────
    async function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        showStatus('Reading file…', false);
        pendingData = await fileToBase64(file);
        preview.src = pendingData;
        previewWrap.classList.remove('hidden');
        fileHint.textContent = file.name;
        showStatus('');
    }

    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

    fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('drag-over'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
    fileDrop.addEventListener('drop', e => {
        e.preventDefault();
        fileDrop.classList.remove('drag-over');
        handleFile(e.dataTransfer.files[0]);
    });

    // ── URL field ─────────────────────────────────────────────────────────
    let urlDebounce;
    urlInput.addEventListener('input', () => {
        clearTimeout(urlDebounce);
        urlDebounce = setTimeout(async () => {
            const url = urlInput.value.trim();
            if (!url) return;
            showStatus('Fetching…', false);
            pendingData = await urlToBase64(url);
            preview.src = pendingData;
            previewWrap.classList.remove('hidden');
            showStatus('Cached ✓');
        }, 600);
    });

    // ── Preview clear ─────────────────────────────────────────────────────
    clearPreview.addEventListener('click', () => {
        pendingData = null;
        preview.src = '';
        previewWrap.classList.add('hidden');
        fileHint.textContent = 'Click or drop an image here';
        fileInput.value = '';
        urlInput.value = '';
    });

    // ── Dim slider (live preview) ─────────────────────────────────────────
    dimRange.addEventListener('input', () => {
        dimLabel.textContent = Math.round(dimRange.value * 100) + '%';
        const overlay = document.getElementById('bg-dim-overlay');
        if (overlay && pendingData) overlay.style.opacity = dimRange.value;
    });

    // ── Blur slider (live preview) ────────────────────────────────────────
    blurRange.addEventListener('input', () => {
        blurLabel.textContent = blurRange.value + 'px';
        if (pendingData) applyBg({
            data: pendingData,
            fit: fitSel.value,
            dim: parseFloat(dimRange.value),
            blur: parseInt(blurRange.value),
        });
    });

    // ── Apply ─────────────────────────────────────────────────────────────
    applyBtn.addEventListener('click', async () => {
        const settings = {
            data: pendingData,
            fit: fitSel.value,
            dim: parseFloat(dimRange.value),
            blur: parseInt(blurRange.value),
            sourceUrl: activeTab === 'url' ? urlInput.value.trim() : '',
            sourceType: activeTab,
        };
        applyBg(settings);
        await storeSet(STORAGE_KEY, settings);
        showStatus('Saved ✓');
    });

    // ── Reset ─────────────────────────────────────────────────────────────
    resetBtn.addEventListener('click', async () => {
        pendingData = null;
        preview.src = '';
        previewWrap.classList.add('hidden');
        fileHint.textContent = 'Click or drop an image here';
        fileInput.value = '';
        urlInput.value = '';
        fitSel.value = 'cover';
        dimRange.value = 0;
        dimLabel.textContent = '0%';
        blurRange.value = 0;
        blurLabel.textContent = '0px';
        applyBg(null);
        await storeSet(STORAGE_KEY, null);
        showStatus('Reset ✓');
    });

    // ── Settings backup ───────────────────────────────────────────────────
    const backupStatus = document.getElementById('bg-backup-status');

    function showBackupStatus(msg, isError = false) {
        backupStatus.textContent = msg;
        backupStatus.classList.remove('hidden', 'bg-status--error');
        if (isError) backupStatus.classList.add('bg-status--error');
        if (msg) setTimeout(() => backupStatus.classList.add('hidden'), 3000);
    }

    document.getElementById('bg-export-settings').addEventListener('click', async () => {
        try {
            await exportSettings();
            showBackupStatus('Exported ✓');
        } catch (e) {
            showBackupStatus('Export failed: ' + e.message, true);
        }
    });

    document.getElementById('bg-import-settings').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';
        showBackupStatus('Importing…');
        try {
            await importSettings(file);
            showBackupStatus('Imported ✓ — reloading…');
            setTimeout(() => location.reload(), 1200);
        } catch (e) {
            showBackupStatus(e.message, true);
        }
    });

    // ── Status helper ─────────────────────────────────────────────────────
    function showStatus(msg, autoHide = true) {
        statusEl.textContent = msg;
        statusEl.classList.toggle('hidden', !msg);
        if (autoHide && msg) setTimeout(() => statusEl.classList.add('hidden'), 2000);
    }

    // ── Panel toggle / close-on-outside-click ────────────────────────────
    btn.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open'); });
    document.addEventListener('click', e => {
        if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('open');
    });
}