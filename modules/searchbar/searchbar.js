// ─── Search Bar Module ─────────────────────────────────────────────────────
// Features:
//   • Google / Bing / DuckDuckGo / Brave search engines
//   • Mode pills: Default, AI (Perplexity), ChatGPT, YouTube
//   • Specific Format dropdown → appends filetype: operator
//   • Live autocomplete suggestions (Google Suggest API)
//   • Keyboard nav (↑ ↓ Enter Esc) through suggestions
//   • Custom CSS injection via settings panel
// ─────────────────────────────────────────────────────────────────────────────

const SB_KEY = 'searchbar_settings';   // { engine, css }

const ENGINES = {
    google: q => `https://www.google.com/search?q=${q}`,
    bing: q => `https://www.bing.com/search?q=${q}`,
    duckduckgo: q => `https://duckduckgo.com/?q=${q}`,
    brave: q => `https://search.brave.com/search?q=${q}`,
};

const SUGGEST_URL = q =>
    `https://suggestqueries.google.com/complete/search?output=firefox&q=${encodeURIComponent(q)}`;

const FORMATS = [
    { label: 'PDF', ext: 'pdf' },
    { label: 'PNG', ext: 'png' },
    { label: 'JPG', ext: 'jpg' },
    { label: 'GIF', ext: 'gif' },
    { label: 'MP4', ext: 'mp4' },
    { label: 'DOCX', ext: 'docx' },
    { label: 'XLSX', ext: 'xlsx' },
    { label: 'PPTX', ext: 'pptx' },
    { label: 'TXT', ext: 'txt' },
    { label: 'CSV', ext: 'csv' },
    { label: 'ZIP', ext: 'zip' },
];

// ── Storage ───────────────────────────────────────────────────────────────────

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

// ── Custom CSS ────────────────────────────────────────────────────────────────

function applyCustomCSS(css) {
    let tag = document.getElementById('sb-custom-style');
    if (!tag) {
        tag = document.createElement('style');
        tag.id = 'sb-custom-style';
        document.head.appendChild(tag);
    }
    tag.textContent = css || '';
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

let suggestDebounce = null;
let lastQuery = '';

async function fetchSuggestions(query) {
    if (!query.trim() || query === lastQuery) return [];
    lastQuery = query;
    try {
        const res = await fetch(SUGGEST_URL(query));
        const data = await res.json();
        return data[1] ?? [];
    } catch { return []; }
}

// ── Main init ─────────────────────────────────────────────────────────────────

export async function initSearchbar(container) {

    // ── Load saved settings ──────────────────────────────────────────────────
    const saved = await storeGet(SB_KEY) ?? {};
    let currentEngine = saved.engine ?? 'google';
    let currentCSS = saved.css ?? '';
    applyCustomCSS(currentCSS);

    // ── Inject CSS ───────────────────────────────────────────────────────────
    if (!document.querySelector('link[href*="searchbar.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'modules/searchbar/searchbar.css';
        document.head.appendChild(link);
    }

    // ── State ────────────────────────────────────────────────────────────────
    let mode = 'default';   // default | ai | chatgpt | youtube
    let selectedFmt = null;        // null or { label, ext }
    let highlightIdx = -1;          // suggestion keyboard nav index
    let suggestionList = [];

    // ── Render ───────────────────────────────────────────────────────────────
    container.innerHTML = `
    <div class="sb-wrapper" id="sb-root">

      <!-- Search input row -->
      <div class="sb-input-row" id="sb-input-row">
        <input class="sb-input" id="sb-input"
               type="text" placeholder="Search the web…"
               autocomplete="off" spellcheck="false">
        <span class="sb-mode-badge" id="sb-mode-badge"></span>
        <button class="sb-go-btn"       id="sb-go-btn">Google</button>
        <button class="sb-settings-btn" id="sb-settings-btn" title="Search settings">⚙</button>
      </div>

      <!-- Suggestions anchored to wrapper, not input-row -->
      <div class="sb-suggestions" id="sb-suggestions"></div>

      <!-- Quick pills -->
      <div class="sb-pills" id="sb-pills">
        <button class="sb-pill active" data-mode="default">Default</button>
        <button class="sb-pill"        data-mode="ai">✦ AI Mode</button>
        <button class="sb-pill"        data-mode="chatgpt">ChatGPT</button>
        <button class="sb-pill"        data-mode="youtube">▷ YouTube</button>

        <!-- Format dropdown pill -->
        <div class="sb-pill-format-wrap" id="sb-fmt-wrap">
          <button class="sb-pill" id="sb-fmt-btn">
            <span id="sb-fmt-label">Specific Format</span>
            <span>▾</span>
          </button>
          <div class="sb-format-dropdown" id="sb-fmt-dropdown">
            <div class="sb-format-item" data-ext="" data-label="None">
              <span>— None —</span>
            </div>
            ${FORMATS.map(f => `
              <div class="sb-format-item" data-ext="${f.ext}" data-label="${f.label}">
                <span>${f.label}</span>
                <span class="sb-format-label">filetype:${f.ext}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Settings panel -->
      <div class="sb-settings-panel" id="sb-settings-panel">
        <div class="sb-settings-section">
          <h3>Default Engine</h3>
          <div class="sb-engine-row">
            <span>Search engine (Default mode)</span>
            <select class="sb-engine-select" id="sb-engine-sel">
              <option value="google"     ${currentEngine === 'google' ? 'selected' : ''}>Google</option>
              <option value="bing"       ${currentEngine === 'bing' ? 'selected' : ''}>Bing</option>
              <option value="duckduckgo" ${currentEngine === 'duckduckgo' ? 'selected' : ''}>DuckDuckGo</option>
              <option value="brave"      ${currentEngine === 'brave' ? 'selected' : ''}>Brave</option>
            </select>
          </div>
        </div>

        <div class="sb-divider"></div>

        <div class="sb-settings-section">
          <h3>Custom CSS</h3>
          <textarea class="sb-css-input" id="sb-css-input"
                    spellcheck="false"
                    placeholder=".sb-input { font-size: 1.1rem; }&#10;.sb-pill { background: #7c3aed; }&#10;.sb-go-btn { background: #16a34a; }"
          >${currentCSS}</textarea>
          <p class="sb-hint">
            Target <code>.sb-wrapper</code>, <code>.sb-input</code>,
            <code>.sb-pill</code>, <code>.sb-go-btn</code>, <code>.sb-suggestion-item</code>, etc.
          </p>
        </div>

        <div class="sb-actions">
          <button class="sb-apply-btn">Apply</button>
          <button class="sb-reset-btn">Reset CSS</button>
        </div>
      </div>

    </div>`;

    // ── Element refs ─────────────────────────────────────────────────────────
    const input = document.getElementById('sb-input');
    const goBtn = document.getElementById('sb-go-btn');
    const modeBadge = document.getElementById('sb-mode-badge');
    const suggestBox = document.getElementById('sb-suggestions');
    const pillBtns = document.querySelectorAll('.sb-pill[data-mode]');
    const fmtWrap = document.getElementById('sb-fmt-wrap');
    const fmtBtn = document.getElementById('sb-fmt-btn');
    const fmtLabel = document.getElementById('sb-fmt-label');
    const fmtDropdown = document.getElementById('sb-fmt-dropdown');
    const settingsBtn = document.getElementById('sb-settings-btn');
    const settingsPanel = document.getElementById('sb-settings-panel');
    const engineSel = document.getElementById('sb-engine-sel');
    const cssInput = document.getElementById('sb-css-input');
    const applyBtn = document.querySelector('.sb-apply-btn');
    const resetBtn = document.querySelector('.sb-reset-btn');

    // ── Mode switching ────────────────────────────────────────────────────────

    const MODE_LABELS = {
        default: { btn: 'Google', badge: '', placeholder: 'Search the web…' },
        ai: { btn: 'Google', badge: '✦ AI Mode', placeholder: 'Ask Google AI…' },
        chatgpt: { btn: 'Ask', badge: 'ChatGPT', placeholder: 'Ask ChatGPT…' },
        youtube: { btn: 'Search', badge: 'YouTube', placeholder: 'Search YouTube…' },
    };

    function setMode(m) {
        mode = m;
        const cfg = MODE_LABELS[m];
        goBtn.textContent = cfg.btn;
        input.placeholder = cfg.placeholder;
        modeBadge.textContent = cfg.badge;
        modeBadge.classList.toggle('visible', !!cfg.badge);

        // Update engine label for default mode
        if (m === 'default') updateGoBtnLabel();

        pillBtns.forEach(p => p.classList.toggle('active', p.dataset.mode === m));
        // Format pill stays independent
        if (m !== 'default' && m !== 'ai') {
            // format still works for all modes that hit Google
        }
    }

    function updateGoBtnLabel() {
        if (mode === 'default') {
            const labels = { google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', brave: 'Brave' };
            goBtn.textContent = labels[currentEngine] ?? 'Search';
        }
    }

    pillBtns.forEach(p => p.addEventListener('click', () => setMode(p.dataset.mode)));

    // ── Format dropdown ───────────────────────────────────────────────────────

    fmtBtn.addEventListener('click', e => {
        e.stopPropagation();
        fmtDropdown.classList.toggle('open');
    });

    fmtDropdown.querySelectorAll('.sb-format-item').forEach(item => {
        item.addEventListener('click', () => {
            const ext = item.dataset.ext;
            const label = item.dataset.label;
            if (!ext) {
                selectedFmt = null;
                fmtLabel.textContent = 'Specific Format';
                fmtBtn.classList.remove('active');
            } else {
                selectedFmt = { label, ext };
                fmtLabel.textContent = label;
                fmtBtn.classList.add('active');
            }
            fmtDropdown.querySelectorAll('.sb-format-item')
                .forEach(i => i.classList.toggle('selected', i === item));
            fmtDropdown.classList.remove('open');
            input.focus();
        });
    });

    // ── Build final URL and navigate ──────────────────────────────────────────

    function doSearch(rawQuery) {
        let q = rawQuery.trim();
        if (!q) return;

        // Append filetype operator if a format is selected and mode is compatible
        if (selectedFmt && (mode === 'default' || mode === 'ai')) {
            q += ` filetype:${selectedFmt.ext}`;
        }

        const enc = encodeURIComponent(q);

        let url;
        switch (mode) {
            case 'ai':
                url = `https://www.google.com/search?udm=50&q=${enc}`;
                break;
            case 'chatgpt':
                url = `https://chatgpt.com/?q=${enc}`;
                break;
            case 'youtube':
                url = `https://www.youtube.com/results?search_query=${enc}`;
                break;
            default:
                url = (ENGINES[currentEngine] ?? ENGINES.google)(enc);
        }

        window.open(url, '_blank');
        closeSuggestions();
    }

    goBtn.addEventListener('click', () => doSearch(input.value));

    // ── Autocomplete ──────────────────────────────────────────────────────────

    function renderSuggestions(items) {
        suggestionList = items;
        highlightIdx = -1;

        if (!items.length) { closeSuggestions(); return; }

        suggestBox.innerHTML = items.map((s, i) => `
            <div class="sb-suggestion-item" data-idx="${i}">
                <span class="sb-suggest-icon">⌕</span>
                <span>${escHtml(s)}</span>
            </div>`).join('');

        suggestBox.querySelectorAll('.sb-suggestion-item').forEach(el => {
            el.addEventListener('mousedown', e => {
                e.preventDefault();
                input.value = suggestionList[+el.dataset.idx];
                doSearch(input.value);
            });
        });

        suggestBox.classList.add('open');
        input.classList.add('sb-input--active');
    }

    function closeSuggestions() {
        suggestBox.classList.remove('open');
        input.classList.remove('sb-input--active');
        suggestionList = [];
        highlightIdx = -1;
    }

    function highlightItem(idx) {
        const items = suggestBox.querySelectorAll('.sb-suggestion-item');
        items.forEach((el, i) => el.classList.toggle('highlighted', i === idx));
        if (idx >= 0 && items[idx]) {
            input.value = suggestionList[idx];
        }
    }

    input.addEventListener('input', () => {
        const q = input.value.trim();
        if (!q) { closeSuggestions(); return; }
        clearTimeout(suggestDebounce);
        // only fetch suggestions in default/ai mode
        if (mode === 'chatgpt' || mode === 'youtube') {
            closeSuggestions(); return;
        }
        suggestDebounce = setTimeout(async () => {
            const items = await fetchSuggestions(q);
            if (input.value.trim() === q) renderSuggestions(items);
        }, 200);
    });

    input.addEventListener('keydown', e => {
        const items = suggestBox.querySelectorAll('.sb-suggestion-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightIdx = Math.min(highlightIdx + 1, suggestionList.length - 1);
            highlightItem(highlightIdx);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightIdx = Math.max(highlightIdx - 1, -1);
            if (highlightIdx === -1) input.value = lastQuery;
            else highlightItem(highlightIdx);
        } else if (e.key === 'Enter') {
            doSearch(input.value);
        } else if (e.key === 'Escape') {
            closeSuggestions();
        }
    });

    input.addEventListener('blur', () => setTimeout(closeSuggestions, 150));

    // ── Settings panel ────────────────────────────────────────────────────────

    settingsBtn.addEventListener('click', e => {
        e.stopPropagation();
        settingsPanel.classList.toggle('open');
    });

    engineSel.addEventListener('change', () => {
        currentEngine = engineSel.value;
        updateGoBtnLabel();
    });

    applyBtn.addEventListener('click', async () => {
        currentCSS = cssInput.value.trim();
        currentEngine = engineSel.value;
        applyCustomCSS(currentCSS);
        await storeSet(SB_KEY, { engine: currentEngine, css: currentCSS });
        settingsPanel.classList.remove('open');
        updateGoBtnLabel();
    });

    resetBtn.addEventListener('click', async () => {
        cssInput.value = '';
        currentCSS = '';
        applyCustomCSS('');
        await storeSet(SB_KEY, { engine: currentEngine, css: '' });
    });

    // ── Close panels on outside click ─────────────────────────────────────────
    document.addEventListener('click', e => {
        if (!fmtWrap.contains(e.target)) fmtDropdown.classList.remove('open');
        if (!settingsPanel.contains(e.target) &&
            e.target !== settingsBtn) settingsPanel.classList.remove('open');
    });

    // ── Helpers ───────────────────────────────────────────────────────────────
    function escHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Initial state ─────────────────────────────────────────────────────────
    setMode('default');
    updateGoBtnLabel();
    input.focus();
}