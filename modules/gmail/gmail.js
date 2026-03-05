// ─── Gmail Module ───────────────────────────────────────────────────────────
// Uses Gmail API v1 via chrome.identity.launchWebAuthFlow — each user
// supplies their own OAuth client ID. Nothing is hardcoded.
// ───────────────────────────────────────────────────────────────────────────

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CACHE_KEY = "gmail_cache";
const TOKEN_KEY = "gmail_token";   // { token, expiry }
const CLIENT_KEY = "gmail_client_id";
const CSS_KEY = "gmail_css";
const CACHE_TTL = 3 * 60 * 1000;  // 3 minutes
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

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

// ── OAuth via launchWebAuthFlow ───────────────────────────────────────────────

async function getToken(clientId, interactive = false) {
    // Return cached token if still valid (2-min buffer)
    const stored = await storageGet(TOKEN_KEY);
    if (stored?.token && stored.expiry - Date.now() > 2 * 60 * 1000) {
        return stored.token;
    }

    // Always try a silent re-auth first — no popup, no user friction.
    // Google reissues a fresh token automatically if the user's Google
    // session is still alive (which it almost always is). This is the
    // fix for the hourly logout: instead of giving up when the 1-hour
    // token expires, we silently renew it.
    const silent = await trySilentAuth(clientId);
    if (silent) return silent;

    // Silent failed — only show the popup if explicitly requested
    if (!interactive) throw new Error("no_token");

    return doAuthFlow(clientId, true);
}

async function trySilentAuth(clientId) {
    try {
        return await doAuthFlow(clientId, false);
    } catch {
        return null;
    }
}

function doAuthFlow(clientId, interactive) {
    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = new URL("https://accounts.google.com/o/oauth2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "token");
    authUrl.searchParams.set("redirect_uri", redirectUrl);
    authUrl.searchParams.set("scope", SCOPE);
    // Only force account picker on explicit user-triggered sign-in
    if (interactive) authUrl.searchParams.set("prompt", "select_account");

    return new Promise((res, rej) => {
        chrome.identity.launchWebAuthFlow(
            { url: authUrl.toString(), interactive },
            async (responseUrl) => {
                if (chrome.runtime.lastError || !responseUrl) {
                    rej(new Error(chrome.runtime.lastError?.message || "auth_cancelled"));
                    return;
                }
                const params = new URLSearchParams(new URL(responseUrl).hash.slice(1));
                const token = params.get("access_token");
                const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
                if (!token) { rej(new Error("no_access_token")); return; }
                await storageSet(TOKEN_KEY, { token, expiry: Date.now() + expiresIn * 1000 });
                res(token);
            }
        );
    });
}

async function revokeToken() {
    await storageRemove(TOKEN_KEY);
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

// ── Render: onboarding (no client ID stored yet) ──────────────────────────────

function showSetup(container) {
    container.innerHTML = `
        <div class="gm-header">
          <div class="gm-title"><span class="gm-title-icon">✉️</span> Gmail</div>
        </div>
        <div class="gm-onboarding">
          <div class="gm-onboard-icon">📬</div>
          <h3>Connect Gmail</h3>
          <p>Paste your OAuth Client ID to get started.</p>
          <input class="gm-settings-input" id="gm-setup-id" type="text"
                 placeholder="xxxx.apps.googleusercontent.com">
          <a class="gm-settings-link" href="https://console.cloud.google.com/apis/credentials"
             target="_blank">Get a Client ID ↗</a>
          <button class="gm-btn" id="gm-setup-save">Connect</button>
          <p class="gm-note">Read-only access. Your emails never leave your browser.</p>
        </div>`;

    $("#gm-setup-save", container).addEventListener("click", async () => {
        const id = $("#gm-setup-id", container).value.trim();
        if (!id) return;
        await storageSet(CLIENT_KEY, id);
        initGmail(container, true);
    });
}

// ── Render: sign-in prompt (client ID exists, but no token) ──────────────────

function showOnboarding(container) {
    container.innerHTML = `
        <div class="gm-header">
          <div class="gm-title"><span class="gm-title-icon">✉️</span> Gmail</div>
          <button class="gm-btn-icon" id="gm-settings" title="Settings">⚙</button>
        </div>
        <div class="gm-onboarding">
          <div class="gm-onboard-icon">📬</div>
          <h3>Sign in to Gmail</h3>
          <p>Connect your Google account to see your 5 most recent emails.</p>
          <button class="gm-btn" id="gm-signin">Sign in with Google</button>
          <p class="gm-note">Read-only access. Your emails never leave your browser.</p>
        </div>`;

    $("#gm-signin", container).addEventListener("click", () => initGmail(container, true));
    $("#gm-settings", container).addEventListener("click", () => showSettings(container));
}

// ── Render: settings panel ────────────────────────────────────────────────────

async function showSettings(container, errorMsg = "") {
    const clientId = await storageGet(CLIENT_KEY);
    const css = await storageGet(CSS_KEY);

    container.innerHTML = `
        <div class="gm-header">
          <div class="gm-title"><span class="gm-title-icon">⚙️</span> Gmail Settings</div>
        </div>
        <div class="gm-settings">
          ${errorMsg ? `<p class="gm-error" style="margin:0">${errorMsg}</p>` : ""}

          <label class="gm-settings-label">OAuth Client ID
            <input class="gm-settings-input" id="gm-s-clientid" type="text"
                   placeholder="xxxx.apps.googleusercontent.com"
                   value="${clientId || ""}">
            <a class="gm-settings-link" href="https://console.cloud.google.com/apis/credentials"
               target="_blank">Google Cloud Console ↗</a>
          </label>

          <label class="gm-settings-label">Custom CSS
            <textarea class="gm-settings-input gm-settings-css" id="gm-s-css"
                      spellcheck="false"
                      placeholder=".gmail-module { background: rgba(0,20,40,0.8); }"
            >${css || ""}</textarea>
            <span class="gm-settings-note">Target <code>.gmail-module</code>, <code>.gm-item</code>, <code>.gm-sender</code>, <code>.gm-subject</code>, etc.</span>
          </label>

          <div class="gm-settings-actions">
            <button class="gm-btn" id="gm-s-save">Save & Reload</button>
            <button class="gm-btn gm-btn-secondary" id="gm-s-cancel">Cancel</button>
          </div>

          <div class="gm-settings-danger">
            <button class="gm-btn gm-btn-danger" id="gm-s-signout">Sign out</button>
          </div>

          <p class="gm-note" style="text-align:center">Client ID and token are stored locally — never shared.</p>
        </div>`;

    $("#gm-s-save", container).addEventListener("click", async () => {
        const newId = $("#gm-s-clientid", container).value.trim();
        const newCss = $("#gm-s-css", container).value;
        if (!newId) {
            showSettings(container, "Client ID cannot be empty.");
            return;
        }
        await storageSet(CLIENT_KEY, newId);
        await storageSet(CSS_KEY, newCss);
        applyCustomCSS(newCss);
        await clearCache();
        initGmail(container, true);
    });

    $("#gm-s-cancel", container).addEventListener("click", () => initGmail(container));
    $("#gm-s-signout", container).addEventListener("click", async () => {
        await revokeToken();
        await clearCache();
        showOnboarding(container);
    });
}

// ── Main init ─────────────────────────────────────────────────────────────────

export async function initGmail(container, interactive = false) {
    // Apply any saved custom CSS immediately
    const css = await storageGet(CSS_KEY);
    if (css) applyCustomCSS(css);

    // No client ID yet — show first-time setup
    const clientId = await storageGet(CLIENT_KEY);
    if (!clientId) { showSetup(container); return; }

    container.innerHTML = `<div class="gm-loading">Loading emails…</div>`;

    let token;
    try {
        token = await getToken(clientId, interactive);
    } catch (e) {
        // Silent re-auth failed AND no interactive request → show sign-in prompt
        showOnboarding(container);
        return;
    }

    // Cache hit
    const cached = await getCached();
    if (cached) { renderEmails(container, cached); return; }

    // Fresh fetch
    try {
        const emails = await loadEmails(token);
        await setCache(emails);
        renderEmails(container, emails);
    } catch (e) {
        if (e.message === "auth_expired") {
            // Token was rejected by the API — nuke it and try a silent renew once
            await revokeToken();
            await clearCache();
            const fresh = await trySilentAuth(clientId);
            if (fresh) {
                try {
                    const emails = await loadEmails(fresh);
                    await setCache(emails);
                    renderEmails(container, emails);
                } catch {
                    showOnboarding(container);
                }
            } else {
                showOnboarding(container);
            }
        } else {
            renderError(container, "⚠️ Could not load emails. Try refreshing.");
        }
    }
}