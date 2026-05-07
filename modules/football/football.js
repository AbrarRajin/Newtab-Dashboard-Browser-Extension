// ─── Football Next Match Module ────────────────────────────────────────────
// API: football-data.org free tier
//   GET /v4/teams/{id}/matches?status=SCHEDULED&limit=5
//   Header: X-Auth-Token: <key>
// ───────────────────────────────────────────────────────────────────────────

const FB_BASE = "https://api.football-data.org/v4";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const DEFAULT_REFRESH_MS = 60 * 60 * 1000; // 1 hour default

const REFRESH_OPTIONS = [
    { label: '15 minutes', ms: 15 * 60 * 1000 },
    { label: '30 minutes', ms: 30 * 60 * 1000 },
    { label: '1 hour',     ms: 60 * 60 * 1000 },
    { label: '3 hours',    ms: 3 * 60 * 60 * 1000 },
    { label: '6 hours',    ms: 6 * 60 * 60 * 1000 },
    { label: '12 hours',   ms: 12 * 60 * 60 * 1000 },
    { label: '24 hours',   ms: 24 * 60 * 60 * 1000 },
];

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
    const rawH = d.getUTCHours();
    const ampm = rawH < 12 ? 'AM' : 'PM';
    const h12 = rawH % 12 || 12;
    return {
        day: days[d.getUTCDay()],
        date: d.getUTCDate(),
        month: months[d.getUTCMonth()],
        hh: String(h12),
        mm: String(d.getUTCMinutes()).padStart(2, '0'),
        ampm,
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
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    if (d > 0) return `${d}d ${h}h`;
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

async function fetchLastMatch(teamId, apiKey) {
    const res = await fetch(`${FB_BASE}/teams/${teamId}/matches?status=FINISHED&limit=5`, {
        headers: { 'X-Auth-Token': apiKey }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const matches = (data.matches || []).sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));
    return matches[0] || null;
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

async function getCachedLastMatch() {
    const { fb_last_cache } = await storageGet(['fb_last_cache']);
    if (!fb_last_cache) return null;
    if (Date.now() - fb_last_cache.timestamp > CACHE_TTL_MS) return null;
    return fb_last_cache.match;
}

async function setCachedLastMatch(match) {
    await storageSet({ fb_last_cache: { timestamp: Date.now(), match } });
}

// ── Ticker ────────────────────────────────────────────────────────────────────

let _ticker = null;
let _autoRefresh = null;

function clearTicker() {
    if (_ticker) { clearInterval(_ticker); _ticker = null; }
}

function startAutoRefresh(container, refreshMs) {
    if (_autoRefresh) clearInterval(_autoRefresh);
    _autoRefresh = setInterval(async () => {
        await storageSet({ fb_cache: null, fb_last_cache: null });
        initFootball(container);
    }, refreshMs);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderMatch(container, match, gmtOffset, lastMatch = null, trackedTeamId = null) {
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
    } else if (status === 'upcoming') {
        badgeHtml = `<span class="fb-badge fb-badge-upcoming" id="fb-days">…</span>`;
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
                    <div class="fb-time-line">${t.hh}:${t.mm}<span class="fb-ampm"> ${t.ampm}</span><span class="fb-gmt"> GMT${sign}${gmtOffset}</span></div>
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
        const el = document.getElementById('fb-days');
        const update = () => {
            const cd = fmtCountdown(match.utcDate);
            if (el && cd) el.textContent = `📅 ${cd}`;
            if (matchStatus(match.utcDate) !== 'upcoming') {
                clearTicker();
                renderMatch(container, match, gmtOffset, lastMatch, trackedTeamId);
            }
        };
        update();
        _ticker = setInterval(update, 60_000);
    }

    $('#fb-settings-btn', container).addEventListener('click', () => showSettings(container));

    if (lastMatch && trackedTeamId) renderLastResult(container, lastMatch, gmtOffset, trackedTeamId);
}

function renderLastResult(container, match, gmtOffset, trackedTeamId) {
    const home = match.homeTeam;
    const away = match.awayTeam;
    const score = match.score?.fullTime;
    const winner = match.score?.winner;

    const isHome = String(home.id) === String(trackedTeamId);
    let outcome = 'D', badgeClass = 'fb-result-badge-draw';
    if (winner === 'HOME_TEAM') {
        outcome = isHome ? 'W' : 'L';
        badgeClass = isHome ? 'fb-result-badge-win' : 'fb-result-badge-loss';
    } else if (winner === 'AWAY_TEAM') {
        outcome = isHome ? 'L' : 'W';
        badgeClass = isHome ? 'fb-result-badge-loss' : 'fb-result-badge-win';
    }

    const homeName = home.shortName || home.name;
    const awayName = away.shortName || away.name;
    const scoreStr = `${score?.home ?? '?'} – ${score?.away ?? '?'}`;

    const html = `
        <div class="fb-result-section">
            <span class="fb-result-label">Last Result${match.competition?.name ? ` ( ${match.competition.name} )` : ''}</span>
            <div class="fb-result-matchup">
                <div class="fb-result-team">
                    ${home.crest ? `<img class="fb-result-crest" src="${home.crest}" alt="">` : ''}
                    <span class="fb-result-team-name">${homeName}</span>
                </div>
                <div class="fb-result-center">
                    <span class="fb-result-score">${scoreStr}</span>
                    <span class="fb-badge ${badgeClass}">${outcome}</span>
                </div>
                <div class="fb-result-team">
                    ${away.crest ? `<img class="fb-result-crest" src="${away.crest}" alt="">` : ''}
                    <span class="fb-result-team-name">${awayName}</span>
                </div>
            </div>
        </div>
    `;
    container.querySelector('.fb-card').insertAdjacentHTML('beforeend', html);
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
    storageGet(['fb_key', 'fb_pid', 'fb_gmt', 'fb_css', 'fb_refresh_ms']).then(({ fb_key = '', fb_pid = '', fb_gmt = 0, fb_css = '', fb_refresh_ms }) => {
        const currentRefreshMs = fb_refresh_ms ?? DEFAULT_REFRESH_MS;
        const gmtOpts = Array.from({ length: 27 }, (_, i) => i - 12)
            .map(n => `<option value="${n}" ${fb_gmt == n ? 'selected' : ''}>GMT${n >= 0 ? '+' : ''}${n}</option>`)
            .join('');
        const refreshOpts = REFRESH_OPTIONS
            .map(o => `<option value="${o.ms}"${o.ms === currentRefreshMs ? ' selected' : ''}>${o.label}</option>`)
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

                    <label class="fb-label">Auto-refresh interval
                        <select class="fb-input" id="fb-s-refresh">${refreshOpts}</select>
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
            const refreshMs = parseInt($('#fb-s-refresh', container).value, 10);
            await storageSet({ fb_key: key, fb_pid: pid, fb_gmt: gmt, fb_css: css, fb_refresh_ms: refreshMs, fb_cache: null, fb_last_cache: null });
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

    const { fb_key: key, fb_pid: pid, fb_gmt: gmtOffset = 0, fb_css: css = '', fb_refresh_ms } =
        await storageGet(['fb_key', 'fb_pid', 'fb_gmt', 'fb_css', 'fb_refresh_ms']);
    const refreshMs = fb_refresh_ms ?? DEFAULT_REFRESH_MS;

    applyCustomCSS(css);

    if (!key || !pid) {
        showOnboarding(container);
        return;
    }

    // Try cache first
    const cached = await getCachedMatch();
    const cachedLast = await getCachedLastMatch();
    if (cached) {
        renderMatch(container, cached, gmtOffset, cachedLast, pid);
        startAutoRefresh(container, refreshMs);
        return;
    }

    // Cache miss — fetch from API
    try {
        const [match, lastMatch] = await Promise.all([
            fetchNextMatch(pid, key),
            fetchLastMatch(pid, key),
        ]);
        await setCachedMatch(match);
        if (lastMatch) await setCachedLastMatch(lastMatch);
        renderMatch(container, match, gmtOffset, lastMatch, pid);
        startAutoRefresh(container, refreshMs);
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