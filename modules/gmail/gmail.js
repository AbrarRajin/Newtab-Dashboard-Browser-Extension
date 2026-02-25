// ─── Gmail Module ───────────────────────────────────────────────────────────
// Uses Gmail API v1 via chrome.identity.launchWebAuthFlow so each user
// supplies their own OAuth client ID — nothing is hardcoded.
// ───────────────────────────────────────────────────────────────────────────

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CACHE_KEY = "gmail_cache";
const TOKEN_KEY = "gmail_token";      // { token, expiry }
const CLIENT_KEY = "gmail_client_id";
const CSS_KEY = "gmail_css";
const CACHE_TTL = 3 * 60 * 1000;     // 3 minutes
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
    tag.textContent = css;
}

// ── OAuth via launchWebAuthFlow ───────────────────────────────────────────────

async function getToken(clientId, interactive = false) {
    const stored = await storageGet(TOKEN_KEY);
    if (stored?.token && stored.expiry - Date.now() > 2 * 60 * 1000) {
        return stored.token;
    }

    if (!interactive) throw new Error("No valid token");

    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = new URL("https://accounts.google.com/o/oauth2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "token");
    authUrl.searchParams.set("redirect_uri", redirectUrl);
    authUrl.searchParams.set("scope", SCOPE);
    authUrl.searchParams.set("prompt", "select_account");

    return new Promise((res, rej) => {
        chrome.identity.launchWebAuthFlow(
            { url: authUrl.toString(), interactive: true },
            async (responseUrl) => {
                if (chrome.runtime.lastError || !responseUrl) {
                    rej(new Error(chrome.runtime.lastError?.message || "Auth cancelled"));
                    return;
                }
                const params = new URLSearchParams(new URL(responseUrl).hash.slice(1));
                const token = params.get("access_token");
                const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
                if (!token) { rej(new Error("No access_token in response")); return; }
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

// ── Gmail API helpers ────────────────────────────────────────────────────────

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
    return m ? m[1].trim() : from.replace(/<.*>/, "").trim() || from;
}

function formatDate(internalDate) {
    const d = new Date(parseInt(internalDate));
    const now = new Date();
    if (d.toDateString() === now.toDateString())
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

async function fetchMessage(id, token) {
    const msg = await gmailGet(
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        token
    );
    const headers = msg.payload.headers;
    return {
        id: msg.id,
        unread: (msg.labelIds ?? []).includes("UNREAD"),
        sender: parseSender(getHeader(headers, "From")),
        subject: getHeader(headers, "Subject") || "(no subject)",
        date: formatDate(msg.internalDate),
    };
}

// ── Email cache ───────────────────────────────────────────────────────────────

async function getCached() {
    const c = await storageGet(CACHE_KEY);
    if (!c || Date.now() - c.ts > CACHE_TTL) return null;
    return c.emails;
}
async function setCache(emails) {
    await storageSet(CACHE_KEY, { ts: Date.now(), emails });
}
async function clearCache() {
    await storageRemove(CACHE_KEY);
}

// ── Fetch emails ──────────────────────────────────────────────────────────────

async function loadEmails(token) {
    const list = await gmailGet("/messages?maxResults=5&labelIds=INBOX", token);
    if (!list.messages?.length) return [];
    return Promise.all(list.messages.map(m => fetchMessage(m.id, token)));
}

// ── Settings panel ────────────────────────────────────────────────────────────

async function showSettings(container, errorMsg = "") {
    const [clientId, css] = await Promise.all([
        storageGet(CLIENT_KEY),
        storageGet(CSS_KEY),
    ]);

    container.innerHTML = `
    <div class="gm-header">
      <div class="gm-title"><span class="gm-title-icon">✉️</span> Gmail Settings</div>
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
                  placeholder=".gmail-module { background: rgba(0,20,40,0.8); }&#10;.gm-sender { color: #4f8ef7; }"
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
        const newClientId = $("#gm-s-clientid", container).value.trim();
        const newCss = $("#gm-s-css", container).value;
        if (!newClientId) return;
        await storageSet(CLIENT_KEY, newClientId);
        await storageSet(CSS_KEY, newCss);
        applyCustomCSS(newCss);
        await clearCache();
        initGmail(container, true);
    });

    $("#gm-s-cancel", container).addEventListener("click", () => initGmail(container));

    $("#gm-s-signout", container).addEventListener("click", async () => {
        await revokeToken();
        await clearCache();
        showSetup(container);
    });
}

// ── Render emails ─────────────────────────────────────────────────────────────

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
      <div class="gm-title"><span class="gm-title-icon"> </span> Gmail INBOX</div>
      <button class="gm-btn-icon" id="gm-open-settings" title="Settings">⚙</button>
    </div>
    <div class="gm-list">${listHTML}</div>
    <div class="gm-footer">
      <a class="gm-open-link" href="https://mail.google.com" target="_blank">Open Gmail ↗</a>
      <button class="gm-refresh-btn" id="gm-refresh">↻ Refresh</button>
    </div>`;

    $("#gm-open-settings", container).addEventListener("click", () => showSettings(container));
    $("#gm-refresh", container).addEventListener("click", async () => {
        await clearCache();
        initGmail(container);
    });
}

function renderError(container, msg) {
    container.innerHTML = `
    <div class="gm-header">
      <div class="gm-title"><span class="gm-title-icon">✉️</span> Gmail</div>
      <button class="gm-btn-icon" id="gm-open-settings" title="Settings">⚙</button>
    </div>
    <div class="gm-error">${msg}</div>`;
    $("#gm-open-settings", container).addEventListener("click", () => showSettings(container));
}

// ── Setup screen (first-time / signed out) ────────────────────────────────────

function showSetup(container, errorMsg = "") {
    container.innerHTML = `
    <div class="gm-header">
      <div class="gm-title"><span class="gm-title-icon">✉️</span> Gmail</div>
    </div>
    <div class="gm-onboarding">
      <div class="gm-onboard-icon">📬</div>
      <h3>Connect Gmail</h3>
      <p>Paste your Google OAuth <strong>Client ID</strong> below.<br>It's stored locally and never shared.</p>
      <input class="gm-settings-input" id="gm-setup-clientid" type="text"
             placeholder="xxxx.apps.googleusercontent.com"
             style="width:100%">
      ${errorMsg ? `<p class="gm-error" style="margin:0;font-size:0.75rem">${errorMsg}</p>` : ""}
      <button class="gm-btn" id="gm-signin">Sign in with Google</button>
      <p class="gm-note">
        Need a client ID?
        <a href="https://console.cloud.google.com/apis/credentials" target="_blank"
           style="color:#7eb8ff;text-decoration:none;">Google Cloud Console ↗</a><br>
        Create an OAuth ID → Web Application, add your redirect URI.
      </p>
    </div>`;

    $("#gm-signin", container).addEventListener("click", async () => {
        const clientId = $("#gm-setup-clientid", container).value.trim();
        if (!clientId) return;
        await storageSet(CLIENT_KEY, clientId);
        initGmail(container, true);
    });
}

// ── Main init ─────────────────────────────────────────────────────────────────

export async function initGmail(container, interactive = false) {
    container.innerHTML = `<div class="gm-loading">Loading emails…</div>`;

    const [clientId, css] = await Promise.all([
        storageGet(CLIENT_KEY),
        storageGet(CSS_KEY),
    ]);

    applyCustomCSS(css || "");

    if (!clientId) {
        showSetup(container);
        return;
    }

    let token;
    try {
        token = await getToken(clientId, interactive);
    } catch (err) {
        if (interactive) {
            showSetup(container, `❌ ${err.message}`);
        } else {
            showSetup(container);
        }
        return;
    }

    const cached = await getCached();
    if (cached) {
        renderEmails(container, cached);
        return;
    }

    try {
        const emails = await loadEmails(token);
        await setCache(emails);
        renderEmails(container, emails);
    } catch (e) {
        if (e.message === "auth_expired") {
            await revokeToken();
            await clearCache();
            showSetup(container, "⚠️ Session expired. Please sign in again.");
        } else {
            renderError(container, "⚠️ Could not load emails. Try refreshing.");
        }
    }
}