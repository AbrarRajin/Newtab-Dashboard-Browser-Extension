// ─── Gmail Module ───────────────────────────────────────────────────────────
// Uses Gmail API v1 via chrome.identity.getAuthToken — the official Chrome
// Extension OAuth flow. The OAuth client ID is declared in manifest.json
// under the "oauth2" key; Chrome manages token acquisition and refresh.
// ───────────────────────────────────────────────────────────────────────────

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CACHE_KEY = "gmail_cache";
const CSS_KEY = "gmail_css";
const CACHE_TTL = 3 * 60 * 1000;  // 3 minutes

function $(sel, ctx = document) { return ctx.querySelector(sel); }

// ── Custom CSS ────────────────────────────────────────────────────────────────

function applyCustomCSS(css) {
    let tag = document.getElementById("gm-custom-style");
    if (!tag) {
        tag = document.createElement("style");
        tag.id = "gm-custom-style";
        document.head.appendChild(tag);
    }
    tag.textContent = css || "";
}

// ── OAuth via chrome.identity.getAuthToken ────────────────────────────────────
// Chrome handles token caching, silent renewal, and the sign-in popup.
// No manual token storage or expiry tracking required.

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

// Evict a stale token from Chrome's cache so the next getAuthToken call
// fetches a fresh one. Call this when the API returns 401.
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
    return c.emails;
}
async function setCache(emails) {
    await storageSet(CACHE_KEY, { emails, ts: Date.now() });
}
async function clearCache() {
    await storageRemove(CACHE_KEY);
}

// ── Gmail API ─────────────────────────────────────────────────────────────────

async function gmailGet(path, token) {
    const r = await fetch(`${GMAIL_API}${path}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (r.status === 401) throw new Error("auth_expired");
    if (!r.ok) throw new Error("api_error");
    return r.json();
}

function getHeader(headers, name) {
    return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseSender(from) {
    const m = from.match(/^"?([^"<]+?)"?\s*</);
    return m ? m[1].trim() : from.replace(/<[^>]+>/, "").trim();
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

async function loadEmails(token) {
    const list = await gmailGet("/messages?maxResults=5&labelIds=INBOX", token);
    if (!list.messages?.length) return [];
    const details = await Promise.all(
        list.messages.map(m =>
            gmailGet(`/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, token)
        )
    );
    return details.map(msg => {
        const h = msg.payload.headers;
        return {
            id: msg.id,
            sender: parseSender(getHeader(h, "From")),
            subject: getHeader(h, "Subject") || "(no subject)",
            date: formatDate(getHeader(h, "Date")),
            unread: msg.labelIds?.includes("UNREAD") ?? false,
        };
    });
}

// ── Render: email list ────────────────────────────────────────────────────────

function renderEmails(container, emails) {
    const listHTML = emails.length
        ? emails.map(e => `
            <div class="gm-item ${e.unread ? "gm-unread" : ""}">
              <div class="gm-sender">
                ${e.unread ? '<span class="gm-unread-dot"></span>' : ""}${e.sender}
              </div>
              <div class="gm-date">${e.date}</div>
              <div class="gm-subject">${e.subject}</div>
            </div>`).join("")
        : `<div class="gm-empty">📭 Inbox is empty</div>`;

    container.innerHTML = `
        <div class="gm-header">
          <div class="gm-title"><span class="gm-title-icon">✉️</span> Gmail</div>
          <div style="display:flex;gap:6px">
            <button class="gm-btn-icon" id="gm-refresh" title="Refresh">↻</button>
            <button class="gm-btn-icon" id="gm-settings" title="Settings">⚙</button>
          </div>
        </div>
        <div class="gm-list">${listHTML}</div>
        <div class="gm-footer">
          <a class="gm-open-link" href="https://mail.google.com" target="_blank">Open Gmail ↗</a>
        </div>`;

    $("#gm-refresh", container).addEventListener("click", async () => {
        await clearCache();
        initGmail(container);
    });
    $("#gm-settings", container).addEventListener("click", () => showSettings(container));
}

function renderError(container, msg) {
    container.innerHTML = `
        <div class="gm-header">
          <div class="gm-title"><span class="gm-title-icon">✉️</span> Gmail</div>
          <button class="gm-btn-icon" id="gm-settings" title="Settings">⚙</button>
        </div>
        <div class="gm-error">${msg}</div>`;
    $("#gm-settings", container).addEventListener("click", () => showSettings(container));
}

// ── Render: sign-in prompt ────────────────────────────────────────────────────

function showOnboarding(container) {
    container.innerHTML = `
        <div class="gm-header">
          <div class="gm-title"><span class="gm-title-icon">✉️</span> Gmail</div>
        </div>
        <div class="gm-onboarding">
          <div class="gm-onboard-icon">📬</div>
          <h3>Sign in to Gmail</h3>
          <p>Connect your Google account to see your 5 most recent emails.</p>
          <button class="gm-btn" id="gm-signin">Sign in with Google</button>
          <p class="gm-note">Read-only access. Your emails never leave your browser.</p>
        </div>`;

    $("#gm-signin", container).addEventListener("click", () => initGmail(container, true));
}

// ── Render: settings panel ────────────────────────────────────────────────────

async function showSettings(container) {
    const css = await storageGet(CSS_KEY);

    container.innerHTML = `
        <div class="gm-header">
          <div class="gm-title"><span class="gm-title-icon">⚙️</span> Gmail Settings</div>
        </div>
        <div class="gm-settings">
          <label class="gm-settings-label">Custom CSS
            <textarea class="gm-settings-input gm-settings-css" id="gm-s-css"
                      spellcheck="false"
                      placeholder=".gmail-module { background: rgba(0,20,40,0.8); }"
            >${css || ""}</textarea>
            <span class="gm-settings-note">Target <code>.gmail-module</code>, <code>.gm-item</code>, <code>.gm-sender</code>, <code>.gm-subject</code>, etc.</span>
          </label>

          <div class="gm-settings-actions">
            <button class="gm-btn" id="gm-s-save">Save</button>
            <button class="gm-btn gm-btn-secondary" id="gm-s-cancel">Cancel</button>
          </div>

          <div class="gm-settings-danger">
            <button class="gm-btn gm-btn-danger" id="gm-s-signout">Sign out</button>
          </div>
        </div>`;

    $("#gm-s-save", container).addEventListener("click", async () => {
        const newCss = $("#gm-s-css", container).value;
        await storageSet(CSS_KEY, newCss);
        applyCustomCSS(newCss);
        await clearCache();
        initGmail(container);
    });

    $("#gm-s-cancel", container).addEventListener("click", () => initGmail(container));

    $("#gm-s-signout", container).addEventListener("click", async () => {
        // Evict the cached token from Chrome so the next sign-in starts fresh
        try {
            const token = await getToken(false);
            await removeCachedToken(token);
        } catch { /* already signed out or no cached token */ }
        await clearCache();
        showOnboarding(container);
    });
}

// ── Auto-refresh timer ────────────────────────────────────────────────────────

let autoRefreshInterval = null;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

function startAutoRefresh(container) {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    // Chrome's getAuthToken handles silent token renewal automatically,
    // so each periodic refresh just re-runs the normal init path.
    autoRefreshInterval = setInterval(async () => {
        await clearCache();
        initGmail(container, false);
    }, AUTO_REFRESH_MS);
}

// ── Main init ─────────────────────────────────────────────────────────────────

export async function initGmail(container, interactive = false) {
    const css = await storageGet(CSS_KEY);
    if (css) applyCustomCSS(css);

    container.innerHTML = `<div class="gm-loading">Loading emails…</div>`;

    let token;
    try {
        token = await getToken(interactive);
    } catch (e) {
        if (interactive) {
            // Sign-in was explicitly requested but failed — surface the reason
            renderError(container, `⚠️ Sign-in failed: ${e.message}`);
        } else {
            // No cached token, non-interactive — show sign-in prompt
            showOnboarding(container);
        }
        return;
    }

    // Cache hit — render immediately
    const cached = await getCached();
    if (cached) {
        renderEmails(container, cached);
        startAutoRefresh(container);
        return;
    }

    // Fresh fetch
    try {
        const emails = await loadEmails(token);
        await setCache(emails);
        renderEmails(container, emails);
        startAutoRefresh(container);
    } catch (e) {
        if (e.message === "auth_expired") {
            // API rejected the token — evict it from Chrome's cache and retry once
            await removeCachedToken(token);
            try {
                const fresh = await getToken(false);
                const emails = await loadEmails(fresh);
                await setCache(emails);
                renderEmails(container, emails);
                startAutoRefresh(container);
            } catch {
                showOnboarding(container);
            }
        } else {
            renderError(container, "⚠️ Could not load emails. Try refreshing.");
        }
    }
}
