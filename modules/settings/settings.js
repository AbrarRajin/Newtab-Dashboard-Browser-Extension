// ── Settings Export / Import ──────────────────────────────────────────────────
// Logic only — no UI. UI lives in the background panel (background.js).
// ─────────────────────────────────────────────────────────────────────────────

const EXPORT_VERSION = 1;

export const EXPORT_KEYS = [
    'dashboard_layout_v1',  // layout card order
    'bg_settings',          // background image + display settings
    'owm_key',              // weather API key
    'w_unit',               // weather units
    'w_css',                // weather custom CSS
    'clock_custom_css',     // clock custom CSS
    'clock_toggles',        // clock display toggles
    'quicklinks_v1',        // all quicklinks data
    'searchbar_settings',   // search engine + custom CSS
    'fb_key',               // football API key
    'fb_pid',               // football team ID
    'fb_gmt',               // football GMT offset
    'fb_css',               // football custom CSS
];

// ── Storage helpers ────────────────────────────────────────────────────────

function storageGetMulti(keys) {
    return new Promise(res => {
        try {
            chrome.storage.local.get(keys, res);
        } catch {
            const result = {};
            for (const key of keys) {
                try { result[key] = JSON.parse(localStorage.getItem(key)); }
                catch { result[key] = null; }
            }
            res(result);
        }
    });
}

function storageSetMulti(obj) {
    return new Promise(res => {
        try {
            chrome.storage.local.set(obj, res);
        } catch {
            for (const [key, val] of Object.entries(obj)) {
                if (val !== null && val !== undefined) {
                    localStorage.setItem(key, JSON.stringify(val));
                } else {
                    localStorage.removeItem(key);
                }
            }
            res();
        }
    });
}

// ── Export ────────────────────────────────────────────────────────────────

export async function exportSettings() {
    const raw = await storageGetMulti(EXPORT_KEYS);
    const data = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v !== null && v !== undefined)
    );
    const payload = { version: EXPORT_VERSION, exported: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────

export async function importSettings(file) {
    const text = await file.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error('Invalid JSON file.'); }

    if (!payload.version || !payload.data || typeof payload.data !== 'object') {
        throw new Error('Unrecognised settings file format.');
    }

    const allowed = new Set(EXPORT_KEYS);
    const toWrite = Object.fromEntries(
        Object.entries(payload.data).filter(([k]) => allowed.has(k))
    );
    await storageSetMulti(toWrite);
}
