// ─── Football Next Match Module ────────────────────────────────────────────
// API: football-data.org free tier
//   GET /v4/teams/{id}/matches?status=SCHEDULED&limit=5
//   Header: X-Auth-Token: <key>
// ───────────────────────────────────────────────────────────────────────────

const FB_BASE = "https://api.football-data.org/v4";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

function $(sel, ctx = document) { return ctx.querySelector(sel); }

// ── Storage ──────────────────────────────────────────────────────────────────

function storageGet(keys) {
    return new Promise(res => chrome.storage.local.get(keys, res));
}
function storageSet(obj) {
    return new Promise(res => chrome.storage.local.set(obj, res));
}

// ── Custom CSS injection ──────────────────────────────────────────────────────

function applyCustomCSS(css) {
    let tag = document.getElementById('fb-custom-style');
    if (!tag) {
        tag = document.createElement('style');
        tag.id = 'fb-custom-style';
        document.head.appendChild(tag);
    }
    tag.textContent = css;
}

// ── Time helpers ─────────────────────────────────────────────────────────────

function applyGMT(utcDate, gmtOffset) {
    const d = new Date(new Date(utcDate).getTime() + gmtOffset * 3_600_000);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
        day: days[d.getUTCDay()],
        date: d.getUTCDate(),
        month: months[d.getUTCMonth()],
        hh: String(d.getUTCHours()).padStart(2, '0'),
        mm: String(d.getUTCMinutes()).padStart(2, '0'),
    };
}

function matchStatus(utcDate) {
    const now = Date.now();
    const kick = new Date(utcDate).getTime();
    const diff = kick - now;
    if (now >= kick && now < kick + LIVE_WINDOW_MS) return 'live';
    if (diff > 0 && diff <= 24 * 3_600_000) return 'soon';
    if (diff > 0) return 'upcoming';
    return 'past';
}

function fmtCountdown(utcDate) {
    const diff = new Date(utcDate).getTime() - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchNextMatch(teamId, apiKey) {
    const res = await fetch(`${FB_BASE}/teams/${teamId}/matches?status=SCHEDULED&limit=5`, {
        headers: { 'X-Auth-Token': apiKey }
    });
    if (res.status === 401 || res.status === 403) throw new Error('invalid_key');
    if (res.status === 404) throw new Error('team_not_found');
    if (!res.ok) throw new Error('fetch_failed');

    const data = await res.json();
    const matches = (data.matches || []).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    if (!matches.length) throw new Error('no_matches');
    return matches[0];
}

// ── Cache ─────────────────────────────────────────────────────────────────────

async function getCachedMatch() {
    const { fb_cache } = await storageGet(['fb_cache']);
    if (!fb_cache) return null;
    const { timestamp, match } = fb_cache;
    if (Date.now() - timestamp > CACHE_TTL_MS) return null;
    if (matchStatus(match.utcDate) === 'past') return null;
    return match;
}

async function setCachedMatch(match) {
    await storageSet({ fb_cache: { timestamp: Date.now(), match } });
}

// ── Ticker ────────────────────────────────────────────────────────────────────

let _ticker = null;

function clearTicker() {
    if (_ticker) { clearInterval(_ticker); _ticker = null; }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderMatch(container, match, gmtOffset) {
    clearTicker();
    const status = matchStatus(match.utcDate);
    const t = applyGMT(match.utcDate, gmtOffset);
    const home = match.homeTeam;
    const away = match.awayTeam;
    const comp = match.competition;
    const sign = gmtOffset >= 0 ? '+' : '';

    let badgeHtml = '';
    if (status === 'live') {
        badgeHtml = `<span class="fb-badge fb-badge-live">● LIVE</span>`;
    } else if (status === 'soon') {
        badgeHtml = `<span class="fb-badge fb-badge-soon" id="fb-countdown">…</span>`;
    }

    container.innerHTML = `
        <div class="fb-card${status === 'live' ? ' fb-card-live' : status === 'soon' ? ' fb-card-soon' : ''}">
            <div class="fb-header">
                <div class="fb-competition">
                    ${comp.emblem ? `<img class="fb-comp-logo" src="${comp.emblem}" alt="">` : '⚽'}
                    <span>${comp.name}</span>
                </div>
                <button class="fb-icon-btn" id="fb-settings-btn" title="Football settings">⚙</button>
            </div>

            <div class="fb-matchup">
                <div class="fb-team">
                    ${home.crest ? `<img class="fb-crest" src="${home.crest}" alt="">` : ''}
                    <span class="fb-team-name">${home.shortName || home.name}</span>
                </div>

                <div class="fb-center">
                    <div class="fb-vs">VS</div>
                    <div class="fb-date-line">${t.day}, ${t.date} ${t.month}</div>
                    <div class="fb-time-line">${t.hh}:${t.mm}<span class="fb-gmt"> GMT${sign}${gmtOffset}</span></div>
                    ${badgeHtml}
                </div>

                <div class="fb-team">
                    ${away.crest ? `<img class="fb-crest" src="${away.crest}" alt="">` : ''}
                    <span class="fb-team-name">${away.shortName || away.name}</span>
                </div>
            </div>
        </div>
    `;

    if (status === 'soon') {
        const el = document.getElementById('fb-countdown');
        const update = () => {
            const cd = fmtCountdown(match.utcDate);
            if (!el) { clearTicker(); return; }
            if (!cd) { clearTicker(); initFootball(container); return; }
            el.textContent = `⏱ ${cd}`;
        };
        update();
        _ticker = setInterval(update, 1000);
    }

    if (status === 'upcoming') {
        _ticker = setInterval(() => {
            if (matchStatus(match.utcDate) !== 'upcoming') {
                clearTicker();
                renderMatch(container, match, gmtOffset);
            }
        }, 60_000);
    }

    $('#fb-settings-btn', container).addEventListener('click', () => showSettings(container));
}

function renderError(container, msg) {
    clearTicker();
    container.innerHTML = `
        <div class="fb-card">
            <p class="fb-error-msg">${msg}</p>
            <button class="fb-btn fb-btn-secondary" id="fb-err-open-settings" style="width:100%;margin-top:12px">Open Settings</button>
        </div>
    `;
    $('#fb-err-open-settings', container).addEventListener('click', () => showSettings(container));
}

// ── Onboarding ────────────────────────────────────────────────────────────────

function showOnboarding(container) {
    clearTicker();
    container.innerHTML = `
        <div class="fb-card">
            <div class="fb-onboarding">
                <div class="fb-onboard-icon">⚽</div>
                <h3>Football Tracker</h3>
                <p>Enter your free <strong>football-data.org</strong> API key and your team's ID.</p>
                <input class="fb-input" id="fb-ob-key" type="text" placeholder="API key…">
                <input class="fb-input" id="fb-ob-pid" type="number" placeholder="Team ID (e.g. 66 = Man Utd)">
                <a class="fb-link" href="https://www.football-data.org/client/register" target="_blank">Get a free API key ↗</a>
                <a class="fb-link" href="https://www.football-data.org/coverage" target="_blank">Find your team ID ↗</a>
                <button class="fb-btn fb-btn-primary" id="fb-ob-save">Save & Load</button>
                <p class="fb-note">Stored locally — never shared.</p>
            </div>
        </div>
    `;
    $('#fb-ob-save', container).addEventListener('click', async () => {
        const key = $('#fb-ob-key', container).value.trim();
        const pid = $('#fb-ob-pid', container).value.trim();
        if (!key || !pid) return;
        await storageSet({ fb_key: key, fb_pid: pid, fb_gmt: 0, fb_css: '' });
        initFootball(container);
    });
}

// ── Settings panel ────────────────────────────────────────────────────────────

function showSettings(container, errorMsg = '') {
    clearTicker();
    storageGet(['fb_key', 'fb_pid', 'fb_gmt', 'fb_css']).then(({ fb_key = '', fb_pid = '', fb_gmt = 0, fb_css = '' }) => {
        const gmtOpts = Array.from({ length: 27 }, (_, i) => i - 12)
            .map(n => `<option value="${n}" ${fb_gmt == n ? 'selected' : ''}>GMT${n >= 0 ? '+' : ''}${n}</option>`)
            .join('');

        container.innerHTML = `
            <div class="fb-card">
                <div class="fb-settings">
                    <h3 class="fb-settings-title">⚽ Football Settings</h3>
                    ${errorMsg ? `<p class="fb-settings-error">${errorMsg}</p>` : ''}

                    <label class="fb-label">football-data.org API Key
                        <input class="fb-input" id="fb-s-key" type="password" placeholder="Your API key…" value="${fb_key}">
                        <a class="fb-link" href="https://www.football-data.org/client/register" target="_blank">Get a free key ↗</a>
                    </label>

                    <label class="fb-label">Team ID
                        <input class="fb-input" id="fb-s-pid" type="number" placeholder="e.g. 66 for Man Utd" value="${fb_pid}">
                        <a class="fb-link" href="https://www.football-data.org/coverage" target="_blank">Find team IDs ↗</a>
                    </label>

                    <label class="fb-label">Timezone (GMT Offset)
                        <select class="fb-input" id="fb-s-gmt">${gmtOpts}</select>
                    </label>

                    <label class="fb-label">Custom CSS
                        <textarea class="fb-input fb-css-input" id="fb-s-css"
                            spellcheck="false"
                            placeholder=".fb-card { background: rgba(0,30,60,0.8); }&#10;.fb-time-line { color: #4f8ef7; }&#10;.fb-team-name { font-size: 0.9rem; }"
                        >${fb_css}</textarea>
                        <span class="fb-note" style="text-align:left;opacity:0.45;">Target <code>.fb-card</code>, <code>.fb-team-name</code>, <code>.fb-time-line</code>, <code>.fb-badge-live</code>, etc.</span>
                    </label>

                    <div class="fb-actions">
                        <button class="fb-btn fb-btn-primary" id="fb-s-save">Save & Reload</button>
                        <button class="fb-btn fb-btn-secondary" id="fb-s-cancel">Cancel</button>
                    </div>
                    <p class="fb-note">Stored locally in your browser.</p>
                </div>
            </div>
        `;

        $('#fb-s-save', container).addEventListener('click', async () => {
            const key = $('#fb-s-key', container).value.trim();
            const pid = $('#fb-s-pid', container).value.trim();
            const gmt = parseFloat($('#fb-s-gmt', container).value);
            const css = $('#fb-s-css', container).value;
            await storageSet({ fb_key: key, fb_pid: pid, fb_gmt: gmt, fb_css: css, fb_cache: null });
            applyCustomCSS(css);
            initFootball(container);
        });

        $('#fb-s-cancel', container).addEventListener('click', () => initFootball(container));
    });
}

// ── Init (exported entry point) ───────────────────────────────────────────────

export async function initFootball(container) {
    clearTicker();
    container.innerHTML = `<div class="fb-card"><p class="fb-loading">Loading match…</p></div>`;

    const { fb_key: key, fb_pid: pid, fb_gmt: gmtOffset = 0, fb_css: css = '' } =
        await storageGet(['fb_key', 'fb_pid', 'fb_gmt', 'fb_css']);

    applyCustomCSS(css);

    if (!key || !pid) {
        showOnboarding(container);
        return;
    }

    // Try cache first
    const cached = await getCachedMatch();
    if (cached) {
        renderMatch(container, cached, gmtOffset);
        return;
    }

    // Cache miss — fetch from API
    try {
        const match = await fetchNextMatch(pid, key);
        await setCachedMatch(match);
        renderMatch(container, match, gmtOffset);
    } catch (e) {
        const msgs = {
            invalid_key: '❌ API key rejected. Check your key — new keys take up to 2 hours to activate.',
            team_not_found: '❌ Team ID not found. Verify it on football-data.org.',
            no_matches: '📅 No upcoming matches found for this team.',
        };
        const msg = msgs[e.message] || '⚠️ Could not load match data. Check your connection.';
        if (e.message === 'invalid_key' || e.message === 'team_not_found') {
            showSettings(container, msg);
        } else {
            renderError(container, msg);
        }
    }
}