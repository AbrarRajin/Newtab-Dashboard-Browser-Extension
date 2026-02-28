const STORAGE_KEY = 'clock_custom_css';
const STORAGE_TOGGLES = 'clock_toggles';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

let settings = { hour24: true, showSeconds: true, showAmPm: true };
let tickInterval = null;

// Always look up fresh — never cache as a module-level const
const root = () => document.getElementById('module-clock');

// ── Storage helpers ───────────────────────────────────────

function chromeGet(key, cb) {
  try { chrome.storage.local.get(key, cb); }
  catch { cb({ [key]: localStorage.getItem(key) }); }
}

function chromeSet(key, val) {
  try { chrome.storage.local.set({ [key]: val }); }
  catch { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); }
}

// ── Clock logic ───────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function tick() {
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');
  if (!timeEl || !dateEl) return;

  const now = new Date();
  let hrs = now.getHours();
  let suffix = '';

  if (!settings.hour24) {
    suffix = settings.showAmPm ? (hrs >= 12 ? ' PM' : ' AM') : '';
    hrs = hrs % 12 || 12;
  }

  const timeParts = [pad(hrs), pad(now.getMinutes())];
  if (settings.showSeconds) timeParts.push(pad(now.getSeconds()));

  timeEl.textContent = timeParts.join(':') + suffix;
  dateEl.textContent = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  tick();
  tickInterval = setInterval(tick, 1000);
}

// ── Render: clock view ────────────────────────────────────

function renderClock(css) {
  const el = root();
  if (!el) return;

  el.innerHTML = `
    <link rel="stylesheet" href="modules/clock/clock.css" />
    <style id="clock-user-styles">${css}</style>
    <div id="clock-wrapper">
      <div id="clock-time">00:00:00</div>
      <div id="clock-date">Monday, January 1</div>
      <button id="clock-settings-btn" title="Clock settings">⚙</button>
    </div>
  `;

  document.getElementById('clock-settings-btn')
    .addEventListener('click', () => showSettings());

  startTick();
}

// ── Render: settings view ─────────────────────────────────

function showSettings() {
  if (!root()) return;

  chromeGet(STORAGE_KEY, res => {
    const el = root();          // re-query AFTER async gap
    if (!el) return;
    const css = res[STORAGE_KEY] || '';

    el.innerHTML = `
      <link rel="stylesheet" href="modules/clock/clock.css" />
      <div id="clock-settings-panel">
        <div class="clock-panel-section">
          <h3>Settings</h3>

          <div class="clock-toggle-row">
            <span>24-hour format</span>
            <label class="clock-toggle">
              <input type="checkbox" id="toggle-24h" ${settings.hour24 ? 'checked' : ''} />
              <span class="clock-toggle-slider"></span>
            </label>
          </div>

          <div class="clock-toggle-row">
            <span>Show seconds</span>
            <label class="clock-toggle">
              <input type="checkbox" id="toggle-seconds" ${settings.showSeconds ? 'checked' : ''} />
              <span class="clock-toggle-slider"></span>
            </label>
          </div>

          <div class="clock-toggle-row ${settings.hour24 ? 'clock-toggle-row--disabled' : ''}" id="toggle-ampm-row">
            <span>Show AM / PM</span>
            <label class="clock-toggle">
              <input type="checkbox" id="toggle-ampm"
                ${settings.showAmPm ? 'checked' : ''}
                ${settings.hour24 ? 'disabled' : ''} />
              <span class="clock-toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="clock-panel-divider"></div>

        <div class="clock-panel-section">
          <h3>Custom CSS</h3>
          <textarea id="clock-css-input" spellcheck="false" placeholder="#clock-time {
  color: #ff6b6b;
  font-size: 8rem;
}

#clock-date {
  color: #ffd93d;
  opacity: 1;
}

body {
  background: #1a1a2e;
}">${css}</textarea>
          <p class="clock-panel-hint">
            Target <code>#clock-time</code>, <code>#clock-date</code>, or <code>body</code>.<br>
            Changes are saved automatically.
          </p>
          <div class="clock-panel-actions">
            <button id="clock-apply-btn">Apply</button>
            <button id="clock-reset-btn">Reset</button>
          </div>
        </div>

        <div class="clock-panel-divider"></div>

        <div class="clock-panel-actions">
          <button id="clock-close-btn">← Back to Clock</button>
        </div>
      </div>
    `;

    // Style the close button without inline style attribute (avoids CSP warning)
    const closeBtn = document.getElementById('clock-close-btn');
    if (closeBtn) {
      closeBtn.style.background = 'rgba(255,255,255,0.08)';
      closeBtn.style.color = '#fff';
      closeBtn.style.flex = '1';
      closeBtn.style.padding = '0.5rem';
      closeBtn.style.borderRadius = '6px';
      closeBtn.style.border = 'none';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontSize = '0.82rem';
      closeBtn.style.fontWeight = '600';
    }

    // Toggle listeners
    const toggle24h = document.getElementById('toggle-24h');
    const toggleSecs = document.getElementById('toggle-seconds');
    const toggleAmPm = document.getElementById('toggle-ampm');
    const amPmRow = document.getElementById('toggle-ampm-row');

    function updateAmPmRow() {
      const disabled = toggle24h.checked;
      amPmRow.classList.toggle('clock-toggle-row--disabled', disabled);
      toggleAmPm.disabled = disabled;
    }

    toggle24h.addEventListener('change', () => {
      settings.hour24 = toggle24h.checked;
      updateAmPmRow();
      chromeSet(STORAGE_TOGGLES, settings);
    });

    toggleSecs.addEventListener('change', () => {
      settings.showSeconds = toggleSecs.checked;
      chromeSet(STORAGE_TOGGLES, settings);
    });

    toggleAmPm.addEventListener('change', () => {
      settings.showAmPm = toggleAmPm.checked;
      chromeSet(STORAGE_TOGGLES, settings);
    });

    // CSS actions
    document.getElementById('clock-apply-btn').addEventListener('click', () => {
      const newCss = document.getElementById('clock-css-input').value.trim();
      chromeSet(STORAGE_KEY, newCss);
      initClock();
    });

    document.getElementById('clock-reset-btn').addEventListener('click', () => {
      document.getElementById('clock-css-input').value = '';
      chromeSet(STORAGE_KEY, '');
      const tag = document.getElementById('clock-user-styles');
      if (tag) tag.textContent = '';
    });

    document.getElementById('clock-close-btn').addEventListener('click', () => initClock());
  });
}

// ── Init ──────────────────────────────────────────────────

function initClock() {
  chromeGet(STORAGE_TOGGLES, res => {
    if (!root()) return;   // re-check after async gap
    let saved = res[STORAGE_TOGGLES];
    if (typeof saved === 'string') { try { saved = JSON.parse(saved); } catch { saved = null; } }
    if (saved) settings = { ...settings, ...saved };

    chromeGet(STORAGE_KEY, res2 => {
      if (!root()) return;   // re-check after second async gap
      renderClock(res2[STORAGE_KEY] || '');
    });
  });
}

// Defer until DOM is ready (module scripts are deferred but being explicit is safer)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initClock);
} else {
  initClock();
}

initClock();