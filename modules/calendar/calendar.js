// ─── Google Calendar Module ──────────────────────────────────────────────────
// Uses Google Calendar API v3 via chrome.identity.getAuthToken — the same
// Chrome Extension OAuth flow as the Gmail module. The OAuth client ID is
// declared in manifest.json under the "oauth2" key.
// ─────────────────────────────────────────────────────────────────────────────

const GCAL_API = "https://www.googleapis.com/calendar/v3";
const CACHE_KEY = "cal_cache";
const CSS_KEY = "cal_css";
const REFRESH_KEY = "cal_refresh_ms";
const CACHE_TTL = 15 * 60 * 1000;       // 15 minutes
const DEFAULT_REFRESH_MS = 15 * 60 * 1000;       // 15 minutes

// Google Calendar colour palette (colorId → hex)
const GCAL_COLORS = {
    "1": "#7986cb", // Lavender
    "2": "#33b679", // Sage
    "3": "#8e24aa", // Grape
    "4": "#e67c73", // Flamingo
    "5": "#f6c026", // Banana
    "6": "#f5511d", // Tangerine
    "7": "#039be5", // Peacock
    "8": "#616161", // Graphite
    "9": "#3f51b5", // Blueberry
    "10": "#0b8043", // Basil
    "11": "#d60000", // Tomato
};

function $(sel, ctx = document) { return ctx.querySelector(sel); }

// ── Custom CSS ────────────────────────────────────────────────────────────────

function applyCustomCSS(css) {
    let tag = document.getElementById("cal-custom-style");
    if (!tag) {
        tag = document.createElement("style");
        tag.id = "cal-custom-style";
        document.head.appendChild(tag);
    }
    tag.textContent = css || "";
}

// ── OAuth via chrome.identity.getAuthToken ────────────────────────────────────

function getToken(interactive = false) {
    return new Promise((res, rej) => {
        chrome.identity.getAuthToken({ interactive }, (token) => {
            if (chrome.runtime.lastError || !token) {
                rej(new Error(chrome.runtime.lastError?.message || "no_token"));
                return;
            }
            res(token);
        });
    });
}

function removeCachedToken(token) {
    return new Promise(res => chrome.identity.removeCachedAuthToken({ token }, res));
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function storageGet(key) {
    return new Promise(res => chrome.storage.local.get(key, r => res(r[key] ?? null)));
}
function storageSet(key, val) {
    return new Promise(res => chrome.storage.local.set({ [key]: val }, res));
}
function storageRemove(key) {
    return new Promise(res => chrome.storage.local.remove(key, res));
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function getCached() {
    const c = await storageGet(CACHE_KEY);
    if (!c || Date.now() - c.ts > CACHE_TTL) return null;
    return c; // { events, ts }
}
async function setCache(events) {
    const ts = Date.now();
    await storageSet(CACHE_KEY, { events, ts });
    return ts;
}
async function clearCache() {
    await storageRemove(CACHE_KEY);
}

// ── Calendar API ──────────────────────────────────────────────────────────────

async function calGet(path, token) {
    const r = await fetch(`${GCAL_API}${path}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (r.status === 401) throw new Error("auth_expired");
    if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        const msg = body?.error?.message ?? `HTTP ${r.status}`;
        throw new Error(`api_error: ${msg}`);
    }
    return r.json();
}

async function loadEvents(token) {
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
        maxResults: 50,
        orderBy: "startTime",
        singleEvents: true,
        timeMin,
        timeMax,
    });
    const data = await calGet(`/calendars/primary/events?${params}`, token);
    return data.items ?? [];
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function formatEventTime(event) {
    if (event.start.date) return "All day";
    const d = new Date(event.start.dateTime);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getEventColor(event) {
    return GCAL_COLORS[event.colorId] ?? "#4f8ef7";
}

// Group events into { label, isoDate, events[] } per day.
// Uses "en-CA" locale to get reliable YYYY-MM-DD date strings independent of
// the user's locale, avoiding UTC-vs-local timezone shifts for all-day events.
function groupEventsByDay(events) {
    const todayStr = new Date().toLocaleDateString("en-CA");
    const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");

    const map = new Map();
    for (const ev of events) {
        // All-day events use start.date (YYYY-MM-DD string, no timezone).
        // Timed events use start.dateTime — convert to local date.
        const key = ev.start.date
            ? ev.start.date
            : new Date(ev.start.dateTime).toLocaleDateString("en-CA");

        if (!map.has(key)) map.set(key, []);
        map.get(key).push(ev);
    }

    const todayNoon = new Date(`${todayStr}T12:00`).getTime();

    return Array.from(map, ([isoDate, dayEvents]) => {
        const daysAway = Math.round((new Date(`${isoDate}T12:00`).getTime() - todayNoon) / 86_400_000);
        let label;
        if (isoDate === todayStr) label = "Today";
        else if (isoDate === tomorrowStr) label = "Tomorrow";
        else {
            // Anchor to noon to prevent DST edge cases flipping the date.
            label = new Date(`${isoDate}T12:00`).toLocaleDateString([], {
                weekday: "long", month: "short", day: "numeric",
            });
        }
        return { label, isoDate, daysAway, events: dayEvents };
    });
}

// ── Last-refreshed ticker ─────────────────────────────────────────────────────

let lastRefreshTickInterval = null;

function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return "just now";
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return hrs === 1 ? "1 hr ago" : `${hrs} hrs ago`;
}

function startRefreshTick(container, fetchTs) {
    if (lastRefreshTickInterval) clearInterval(lastRefreshTickInterval);
    const update = () => {
        const el = $("#cal-last-refresh", container);
        if (el) el.textContent = timeAgo(fetchTs);
    };
    update();
    lastRefreshTickInterval = setInterval(update, 30 * 1000);
}

function stopRefreshTick() {
    if (lastRefreshTickInterval) {
        clearInterval(lastRefreshTickInterval);
        lastRefreshTickInterval = null;
    }
}

// ── Render: event list ────────────────────────────────────────────────────────

function renderEvents(container, groupedDays, fetchTs) {
    const listHTML = groupedDays.length
        ? groupedDays.map(({ label, daysAway, events }) => `
            <div class="cal-day-group">
              <div class="cal-day-label">
                <span>${label}</span>
                ${daysAway >= 2 ? `<span class="cal-days-away">IN ${daysAway} DAYS</span>` : ''}
              </div>
              ${events.map(ev => `
                <div class="cal-item">
                  <span class="cal-color-dot" style="background:${getEventColor(ev)}"></span>
                  <div class="cal-item-body">
                    <div class="cal-event-title">${ev.summary ?? "(no title)"}</div>
                    <div class="cal-event-time">${formatEventTime(ev)}</div>
                  </div>
                </div>`).join("")}
            </div>`).join("")
        : `<div class="cal-empty">📭 No events in the next 30 days</div>`;

    container.innerHTML = `
        <div class="cal-header">
          <div class="cal-title"><span class="cal-title-icon">📅</span> Calendar</div>
          <div class="cal-header-right">
            <span class="cal-last-refresh" id="cal-last-refresh"></span>
            <button class="cal-btn-icon" id="cal-refresh" title="Refresh">↻</button>
            <button class="cal-btn-icon" id="cal-settings" title="Settings">⚙</button>
          </div>
        </div>
        <div class="cal-list">${listHTML}</div>
        <div class="cal-footer">
          <a class="cal-open-link" href="https://calendar.google.com" target="_blank">Open Calendar ↗</a>
        </div>`;

    startRefreshTick(container, fetchTs);

    $("#cal-refresh", container).addEventListener("click", async () => {
        stopRefreshTick();
        await clearCache();
        initCalendar(container);
    });
    $("#cal-settings", container).addEventListener("click", () => {
        stopRefreshTick();
        showSettings(container);
    });
}

function renderError(container, msg) {
    container.innerHTML = `
        <div class="cal-header">
          <div class="cal-title"><span class="cal-title-icon">📅</span> Calendar</div>
          <button class="cal-btn-icon" id="cal-settings" title="Settings">⚙</button>
        </div>
        <div class="cal-error">${msg}</div>`;
    $("#cal-settings", container).addEventListener("click", () => showSettings(container));
}

// ── Render: sign-in prompt ────────────────────────────────────────────────────

function showOnboarding(container) {
    container.innerHTML = `
        <div class="cal-header">
          <div class="cal-title"><span class="cal-title-icon">📅</span> Calendar</div>
        </div>
        <div class="cal-onboarding">
          <div class="cal-onboard-icon">📆</div>
          <h3>Sign in to Calendar</h3>
          <p>Connect your Google account to see your upcoming events for the next 7 days.</p>
          <button class="cal-btn" id="cal-signin">Sign in with Google</button>
          <p class="cal-note">Read-only access. Your events never leave your browser.</p>
        </div>`;

    $("#cal-signin", container).addEventListener("click", () => initCalendar(container, true));
}

// ── Render: settings panel ────────────────────────────────────────────────────

const REFRESH_OPTIONS = [
    { label: "5 minutes", ms: 5 * 60 * 1000 },
    { label: "10 minutes", ms: 10 * 60 * 1000 },
    { label: "15 minutes", ms: 15 * 60 * 1000 },
    { label: "30 minutes", ms: 30 * 60 * 1000 },
    { label: "60 minutes", ms: 60 * 60 * 1000 },
];

async function showSettings(container) {
    const [css, refreshMs] = await Promise.all([
        storageGet(CSS_KEY),
        storageGet(REFRESH_KEY),
    ]);
    const currentMs = refreshMs ?? DEFAULT_REFRESH_MS;

    const refreshOptions = REFRESH_OPTIONS.map(o =>
        `<option value="${o.ms}"${o.ms === currentMs ? " selected" : ""}>${o.label}</option>`
    ).join("");

    container.innerHTML = `
        <div class="cal-header">
          <div class="cal-title"><span class="cal-title-icon">⚙️</span> Calendar Settings</div>
        </div>
        <div class="cal-settings">
          <label class="cal-settings-label">Auto-refresh interval
            <select class="cal-settings-input cal-settings-select" id="cal-s-refresh">
              ${refreshOptions}
            </select>
          </label>

          <label class="cal-settings-label">Custom CSS
            <textarea class="cal-settings-input cal-settings-css" id="cal-s-css"
                      spellcheck="false"
                      placeholder=".cal-module { background: rgba(0,20,40,0.8); }"
            >${css || ""}</textarea>
            <span class="cal-settings-note">Target <code>.cal-module</code>, <code>.cal-item</code>, <code>.cal-event-title</code>, <code>.cal-day-label</code>, etc.</span>
          </label>

          <div class="cal-settings-actions">
            <button class="cal-btn" id="cal-s-save">Save</button>
            <button class="cal-btn cal-btn-secondary" id="cal-s-cancel">Cancel</button>
          </div>

          <div class="cal-settings-danger">
            <button class="cal-btn cal-btn-danger" id="cal-s-signout">Sign out</button>
          </div>
        </div>`;

    $("#cal-s-save", container).addEventListener("click", async () => {
        const newCss = $("#cal-s-css", container).value;
        const newRefreshMs = parseInt($("#cal-s-refresh", container).value, 10);
        await Promise.all([
            storageSet(CSS_KEY, newCss),
            storageSet(REFRESH_KEY, newRefreshMs),
        ]);
        applyCustomCSS(newCss);
        await clearCache();
        initCalendar(container);
    });

    $("#cal-s-cancel", container).addEventListener("click", () => initCalendar(container));

    $("#cal-s-signout", container).addEventListener("click", async () => {
        try {
            const token = await getToken(false);
            await removeCachedToken(token);
        } catch { /* already signed out */ }
        await clearCache();
        showOnboarding(container);
    });
}

// ── Auto-refresh timer ────────────────────────────────────────────────────────

let autoRefreshInterval = null;

function startAutoRefresh(container, refreshMs) {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(async () => {
        await clearCache();
        initCalendar(container, false);
    }, refreshMs);
}

// ── Main init ─────────────────────────────────────────────────────────────────

export async function initCalendar(container, interactive = false) {
    const css = await storageGet(CSS_KEY);
    if (css) applyCustomCSS(css);

    const refreshMs = (await storageGet(REFRESH_KEY)) ?? DEFAULT_REFRESH_MS;

    container.innerHTML = `<div class="cal-loading">Loading events…</div>`;

    let token;
    try {
        token = await getToken(interactive);
    } catch (e) {
        if (interactive) {
            renderError(container, `⚠️ Sign-in failed: ${e.message}`);
        } else {
            showOnboarding(container);
        }
        return;
    }

    // Cache hit — render immediately
    const cached = await getCached();
    if (cached) {
        renderEvents(container, groupEventsByDay(cached.events), cached.ts);
        startAutoRefresh(container, refreshMs);
        return;
    }

    // Fresh fetch
    try {
        const events = await loadEvents(token);
        const ts = await setCache(events);
        renderEvents(container, groupEventsByDay(events), ts);
        startAutoRefresh(container, refreshMs);
    } catch (e) {
        if (e.message === "auth_expired") {
            await removeCachedToken(token);
            try {
                const fresh = await getToken(false);
                const events = await loadEvents(fresh);
                const ts = await setCache(events);
                renderEvents(container, groupEventsByDay(events), ts);
                startAutoRefresh(container, refreshMs);
            } catch {
                showOnboarding(container);
            }
        } else {
            renderError(container, `⚠️ ${e.message}`);
        }
    }
}
