// ─── Weather Module ────────────────────────────────────────────────────────
// Uses OpenWeatherMap free tier:
//   current  → /data/2.5/weather
//   forecast → /data/2.5/forecast  (5-day / 3-hour intervals → aggregated daily)
// API key is stored per-user in chrome.storage.local — never hardcoded.
// ───────────────────────────────────────────────────────────────────────────

const OWM_BASE = "https://api.openweathermap.org/data/2.5";

// ── Helpers ─────────────────────────────────────────────────────────────────

function $(sel, ctx = document) { return ctx.querySelector(sel); }

function tempUnit(unit) { return unit === "imperial" ? "°F" : "°C"; }

function formatDay(dtUnix) {
    return new Date(dtUnix * 1000).toLocaleDateString(undefined, { weekday: "short" });
}

// Aggregate 3-hour OWM slots into daily { day, icon, min, max, description }
function aggregateForecast(list) {
    const days = {};
    for (const slot of list) {
        const date = new Date(slot.dt * 1000).toDateString();
        if (!days[date]) {
            days[date] = { dt: slot.dt, temps: [], icons: [], descriptions: [] };
        }
        days[date].temps.push(slot.main.temp);
        days[date].icons.push(slot.weather[0].icon);
        days[date].descriptions.push(slot.weather[0].description);
    }
    return Object.values(days).slice(0, 5).map(d => ({
        day: formatDay(d.dt),
        icon: d.icons[Math.floor(d.icons.length / 2)],   // mid-day icon
        min: Math.round(Math.min(...d.temps)),
        max: Math.round(Math.max(...d.temps)),
        description: d.descriptions[Math.floor(d.descriptions.length / 2)],
    }));
}

function owmIconUrl(icon) {
    return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

// ── Storage helpers ──────────────────────────────────────────────────────────

function storageGet(keys) {
    return new Promise(res => chrome.storage.local.get(keys, res));
}

function storageSet(obj) {
    return new Promise(res => chrome.storage.local.set(obj, res));
}

// ── Geolocation ──────────────────────────────────────────────────────────────

function getPosition() {
    return new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
    );
}

// ── API calls ────────────────────────────────────────────────────────────────

async function fetchWeather(lat, lon, key, unit) {
    const [curRes, fcRes] = await Promise.all([
        fetch(`${OWM_BASE}/weather?lat=${lat}&lon=${lon}&appid=${key}&units=${unit}`),
        fetch(`${OWM_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${key}&units=${unit}`),
    ]);

    if (curRes.status === 401 || fcRes.status === 401) throw new Error("invalid_key");
    if (!curRes.ok || !fcRes.ok) throw new Error("fetch_failed");

    const [cur, fc] = await Promise.all([curRes.json(), fcRes.json()]);
    return { current: cur, forecast: fc };
}

// ── Render ───────────────────────────────────────────────────────────────────

function renderWeather(container, current, forecastList, unit) {
    const sym = tempUnit(unit);
    const { temp, humidity, wind_speed } = { ...current.main, wind_speed: current.wind.speed };

    container.innerHTML = `
    <div class="w-header">
      <div class="w-location">${current.name}, ${current.sys.country}</div>
      <button class="w-btn-icon" id="w-settings-toggle" title="Settings">⚙</button>
    </div>

    <div class="w-current">
      <img class="w-icon-lg" src="${owmIconUrl(current.weather[0].icon)}" alt="${current.weather[0].description}">
      <div class="w-temp-main">${Math.round(temp)}${sym}</div>
      <div class="w-condition">${current.weather[0].description}</div>
      <div class="w-meta">
        <span>💧 ${humidity}%</span>
        <span>💨 ${Math.round(wind_speed)} ${unit === "imperial" ? "mph" : "m/s"}</span>
      </div>
    </div>

    <div class="w-forecast">
      ${forecastList.map(d => `
        <div class="w-day">
          <div class="w-day-name">${d.day}</div>
          <img class="w-icon-sm" src="${owmIconUrl(d.icon)}" alt="${d.description}">
          <div class="w-day-temps">
            <span class="w-day-high">${d.max}${sym}</span>
            <span class="w-day-low">${d.min}${sym}</span>
          </div>
        </div>`).join("")}
    </div>
  `;

    $("#w-settings-toggle", container).addEventListener("click", () => {
        showSettingsPanel(container, unit);
    });
}

function renderError(container, msg) {
    container.innerHTML = `<div class="w-error">${msg}</div>`;
}

// ── Settings / Customisation panel ───────────────────────────────────────────

function showSettingsPanel(container, currentUnit, errorMsg = "") {
    storageGet(["owm_key", "w_unit", "w_css"]).then(({ owm_key = "", w_unit = "metric", w_css = "" }) => {
        container.innerHTML = `
      <div class="w-settings">
        <h3 class="w-settings-title">⚙ Weather Settings</h3>
        ${errorMsg ? `<p class="w-settings-error">${errorMsg}</p>` : ""}

        <label class="w-label">OpenWeatherMap API Key
          <input class="w-input" id="w-api-key" type="password"
                 placeholder="Paste your free API key…" value="${owm_key}">
          <a class="w-link" href="https://home.openweathermap.org/api_keys"
             target="_blank">Get a free key ↗</a>
        </label>

        <label class="w-label">Units
          <select class="w-input" id="w-unit">
            <option value="metric"   ${w_unit === "metric" ? "selected" : ""}>Celsius (°C)</option>
            <option value="imperial" ${w_unit === "imperial" ? "selected" : ""}>Fahrenheit (°F)</option>
          </select>
        </label>

        <label class="w-label">Custom CSS
          <textarea class="w-input w-css-input" id="w-custom-css"
                    placeholder=".weather-module { background: #1a1a2e; } …">${w_css}</textarea>
        </label>

        <div class="w-settings-actions">
          <button class="w-btn w-btn-save" id="w-save">Save & Reload</button>
          <button class="w-btn w-btn-cancel" id="w-cancel">Cancel</button>
        </div>
        <p class="w-settings-note">Your key is stored locally in your browser and never shared.</p>
      </div>
    `;

        $("#w-save", container).addEventListener("click", async () => {
            const key = $("#w-api-key", container).value.trim();
            const unit = $("#w-unit", container).value;
            const css = $("#w-custom-css", container).value;
            await storageSet({ owm_key: key, w_unit: unit, w_css: css });
            applyCustomCSS(css);
            initWeather(container);           // reload with new settings
        });

        $("#w-cancel", container).addEventListener("click", () => {
            initWeather(container);
        });
    });
}

// ── Custom CSS injection ──────────────────────────────────────────────────────

function applyCustomCSS(css) {
    let tag = document.getElementById("w-custom-style");
    if (!tag) {
        tag = document.createElement("style");
        tag.id = "w-custom-style";
        document.head.appendChild(tag);
    }
    tag.textContent = css;
}

// ── Onboarding (no key yet) ───────────────────────────────────────────────────

function showOnboarding(container) {
    container.innerHTML = `
    <div class="w-onboarding">
      <div class="w-onboard-icon">🌤</div>
      <h3>Set up Weather</h3>
      <p>Enter your free <strong>OpenWeatherMap</strong> API key to get started.</p>
      <input class="w-input" id="w-onboard-key" type="text" placeholder="Paste API key here…">
      <a class="w-link" href="https://home.openweathermap.org/api_keys" target="_blank">
        Get a free key ↗
      </a>
      <button class="w-btn w-btn-save" id="w-onboard-save">Save Key</button>
      <p class="w-settings-note">Stored locally — never sent anywhere except OpenWeatherMap.</p>
    </div>
  `;

    $("#w-onboard-save", container).addEventListener("click", async () => {
        const key = $("#w-onboard-key", container).value.trim();
        if (!key) return;
        await storageSet({ owm_key: key });
        initWeather(container);
    });
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function getCachedWeather() {
    const { w_cache } = await storageGet(["w_cache"]);
    if (!w_cache) return null;
    const { timestamp, current, forecast } = w_cache;
    if (Date.now() - timestamp > CACHE_TTL_MS) return null; // expired
    return { current, forecast };
}

async function setCachedWeather(current, forecast) {
    await storageSet({ w_cache: { timestamp: Date.now(), current, forecast } });
}

// ── Main init ─────────────────────────────────────────────────────────────────

export async function initWeather(container) {
    container.innerHTML = `<div class="w-loading">Fetching weather…</div>`;

    const { owm_key: key, w_unit: unit = "metric", w_css: css = "" } =
        await storageGet(["owm_key", "w_unit", "w_css"]);

    applyCustomCSS(css);

    if (!key) {
        showOnboarding(container);
        return;
    }

    // ── Try cache first ──────────────────────────────────────────────────────
    const cached = await getCachedWeather();
    if (cached) {
        const dailyForecast = aggregateForecast(cached.forecast.list);
        renderWeather(container, cached.current, dailyForecast, unit);
        return; // no API call needed
    }

    // ── Cache miss — fetch fresh data ────────────────────────────────────────
    let lat, lon;
    try {
        const pos = await getPosition();
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
    } catch {
        renderError(container, "📍 Location access denied.");
        return;
    }

    try {
        const { current, forecast } = await fetchWeather(lat, lon, key, unit);
        await setCachedWeather(current, forecast);
        const dailyForecast = aggregateForecast(forecast.list);
        renderWeather(container, current, dailyForecast, unit);
    } catch (e) {
        if (e.message === "invalid_key") {
            showSettingsPanel(container, unit, "❌ API key rejected (401). If your key is new, wait up to 2 hours for it to activate, then try again.");
        } else {
            renderError(container, "⚠️ Could not load weather. Check your connection and try reloading.");
        }
    }
}