// ── Pomodoro Timer Module ──────────────────────────────────────────────────

const POMO_KEY       = 'pomo_settings';
const POMO_STATE_KEY = 'pomo_state';

const DEFAULTS = {
    workMins: 25,
    shortBreakMins: 5,
    longBreakMins: 15,
    sessionsBeforeLong: 4,
    autoStart: false,
};

// ── Storage ────────────────────────────────────────────────────────────────

function storageGet(key) {
    return new Promise(res => {
        try { chrome.storage.local.get(key, d => res(d[key] ?? null)); }
        catch { try { res(JSON.parse(localStorage.getItem(key))); } catch { res(null); } }
    });
}

function storageSet(key, val) {
    return new Promise(res => {
        try { chrome.storage.local.set({ [key]: val }, res); }
        catch { localStorage.setItem(key, JSON.stringify(val)); res(); }
    });
}

// ── SVG ring constants ─────────────────────────────────────────────────────

const RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ── Simple beep via Web Audio ──────────────────────────────────────────────

function beep() {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.7);
    } catch { /* audio not available */ }
}

// ── State restoration ──────────────────────────────────────────────────────
// Called on load. If the timer was running when the tab closed, computes how
// much real time passed and walks forward through phases accordingly.

function restoreState(saved, cfg) {
    let { phase, sessionsDone, totalSeconds, remaining, running } = saved;

    if (running && saved.savedAt) {
        const elapsed = Math.floor((Date.now() - saved.savedAt) / 1000);
        remaining -= elapsed;

        // Walk through any phases that completed while the tab was closed
        while (remaining <= 0) {
            if (phase === 'work') {
                sessionsDone++;
                if (sessionsDone % cfg.sessionsBeforeLong === 0) {
                    phase = 'long';
                    totalSeconds = cfg.longBreakMins * 60;
                } else {
                    phase = 'short';
                    totalSeconds = cfg.shortBreakMins * 60;
                }
            } else {
                phase = 'work';
                totalSeconds = cfg.workMins * 60;
            }
            remaining += totalSeconds;
        }
    }

    return { phase, sessionsDone, totalSeconds, remaining, running };
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function initPomodoro(container) {
    if (!container) return;

    const [savedCfg, savedState] = await Promise.all([
        storageGet(POMO_KEY),
        storageGet(POMO_STATE_KEY),
    ]);
    const cfg = { ...DEFAULTS, ...(savedCfg || {}) };

    // ── Runtime state ────────────────────────────────────────────────────
    let phase        = 'work';
    let sessionsDone = 0;
    let totalSeconds = cfg.workMins * 60;
    let remaining    = totalSeconds;
    let running      = false;
    let interval     = null;
    let showSettings = false;
    let tickCount    = 0;
    let hasStarted   = false;

    // Restore persisted state if present
    if (savedState) {
        ({ phase, sessionsDone, totalSeconds, remaining, running } =
            restoreState(savedState, cfg));
        // Consider started if the timer has been used (not at full time or was running)
        hasStarted = running || remaining < totalSeconds || sessionsDone > 0;
    }

    // ── Persist current state ─────────────────────────────────────────────
    function saveState() {
        storageSet(POMO_STATE_KEY, {
            phase,
            sessionsDone,
            totalSeconds,
            remaining,
            running,
            savedAt: Date.now(),
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function phaseLabel() {
        if (phase === 'work') return 'Work Session';
        if (phase === 'short') return 'Short Break';
        return 'Long Break';
    }

    function phaseClass() {
        if (phase === 'short') return 'phase-short';
        if (phase === 'long') return 'phase-long';
        return '';
    }

    function fmt(secs) {
        const m = String(Math.floor(secs / 60)).padStart(2, '0');
        const s = String(secs % 60).padStart(2, '0');
        return `${m}:${s}`;
    }

    function ringOffset(ratio) {
        return CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, ratio)));
    }

    // ── Timer logic ───────────────────────────────────────────────────────

    function tick() {
        remaining--;
        tickCount++;
        if (remaining <= 0) {
            remaining = 0;
            advancePhase();
        } else {
            updateDisplay();
            // Save every 10 ticks so savedAt stays fresh (for tab-close recovery)
            if (tickCount % 10 === 0) saveState();
        }
    }

    function advancePhase() {
        clearInterval(interval);
        interval = null;
        running = false;
        beep();

        if (phase === 'work') {
            sessionsDone++;
            if (sessionsDone % cfg.sessionsBeforeLong === 0) {
                phase = 'long';
                totalSeconds = cfg.longBreakMins * 60;
            } else {
                phase = 'short';
                totalSeconds = cfg.shortBreakMins * 60;
            }
        } else {
            phase = 'work';
            totalSeconds = cfg.workMins * 60;
        }

        remaining = totalSeconds;
        saveState();
        if (cfg.autoStart) startTimer();
        else render();
    }

    function startTimer() {
        if (running) return;
        running = true;
        hasStarted = true;
        tickCount = 0;
        saveState();
        interval = setInterval(tick, 1000);
        render();
    }

    function pauseTimer() {
        running = false;
        clearInterval(interval);
        interval = null;
        saveState();
        render();
    }

    function resetTimer() {
        clearInterval(interval);
        interval = null;
        running = false;
        hasStarted = false;
        phase = 'work';
        sessionsDone = 0;
        totalSeconds = cfg.workMins * 60;
        remaining = totalSeconds;
        saveState();
        render();
    }

    // Fast DOM update — avoids full re-render while timer is running
    function updateDisplay() {
        const timeEl = container.querySelector('.pomo-time');
        const ringFg = container.querySelector('.pomo-ring-fg');
        if (timeEl) timeEl.textContent = fmt(remaining);
        if (ringFg) ringFg.style.strokeDashoffset = ringOffset(remaining / totalSeconds);
    }

    // ── Render ────────────────────────────────────────────────────────────

    function render() {
        if (showSettings) { renderSettings(); return; }

        const completedInCycle = sessionsDone % cfg.sessionsBeforeLong;
        const dots = Array.from({ length: cfg.sessionsBeforeLong }, (_, i) =>
            `<div class="pomo-dot${i < completedInCycle ? ' filled' : ''}"></div>`
        ).join('');

        container.innerHTML = `
<div class="pomo-header">
  <span class="pomo-title">Pomodoro</span>
  <button class="pomo-btn-icon pomo-settings-btn" title="Settings">⚙</button>
</div>

<div class="pomo-ring-wrap">
  <div class="pomo-ring">
    <svg width="100%" height="100%" viewBox="0 0 160 160">
      <circle class="pomo-ring-bg" cx="80" cy="80" r="${RADIUS}"/>
      <circle class="pomo-ring-fg ${phaseClass()}${!running && !hasStarted ? ' inactive' : ''}" cx="80" cy="80" r="${RADIUS}"
        style="stroke-dasharray:${CIRCUMFERENCE};stroke-dashoffset:${ringOffset(remaining / totalSeconds)}"/>
    </svg>
    <div class="pomo-time">${fmt(remaining)}</div>
  </div>
</div>

<div class="pomo-phase">${phaseLabel()}</div>
<div class="pomo-dots">${dots}</div>

<div class="pomo-controls">
  <button class="pomo-btn pomo-btn-primary pomo-play-btn">
    ${running ? '⏸ Pause' : '▶ Start'}
  </button>
  <button class="pomo-btn pomo-btn-secondary pomo-reset-btn">↺ Reset</button>
</div>`;

        container.querySelector('.pomo-play-btn').addEventListener('click', () => {
            if (running) pauseTimer(); else startTimer();
        });
        container.querySelector('.pomo-reset-btn').addEventListener('click', resetTimer);
        container.querySelector('.pomo-settings-btn').addEventListener('click', () => {
            showSettings = true;
            render();
        });

        // If we restored into a running state, kick off the interval
        if (running && !interval) {
            interval = setInterval(tick, 1000);
        }
    }

    function renderSettings() {
        container.innerHTML = `
<div class="pomo-settings">
  <p class="pomo-settings-title">Pomodoro Settings</p>

  <label class="pomo-label">Work duration (minutes)
    <input class="pomo-input" type="number" id="pomo-work" min="1" max="90" value="${cfg.workMins}">
  </label>
  <label class="pomo-label">Short break (minutes)
    <input class="pomo-input" type="number" id="pomo-short" min="1" max="30" value="${cfg.shortBreakMins}">
  </label>
  <label class="pomo-label">Long break (minutes)
    <input class="pomo-input" type="number" id="pomo-long" min="1" max="60" value="${cfg.longBreakMins}">
  </label>
  <label class="pomo-label">Sessions before long break
    <input class="pomo-input" type="number" id="pomo-sessions" min="1" max="8" value="${cfg.sessionsBeforeLong}">
  </label>

  <label class="pomo-label pomo-label-row">
    <input type="checkbox" id="pomo-auto" ${cfg.autoStart ? 'checked' : ''} style="width:auto;accent-color:#4f8ef7">
    Auto-start next session
  </label>

  <div class="pomo-settings-actions">
    <button class="pomo-btn pomo-btn-save">Save</button>
    <button class="pomo-btn pomo-btn-cancel">Cancel</button>
  </div>
</div>`;

        container.querySelector('.pomo-btn-save').addEventListener('click', async () => {
            cfg.workMins           = Math.max(1, parseInt(container.querySelector('#pomo-work').value)     || 25);
            cfg.shortBreakMins     = Math.max(1, parseInt(container.querySelector('#pomo-short').value)    || 5);
            cfg.longBreakMins      = Math.max(1, parseInt(container.querySelector('#pomo-long').value)     || 15);
            cfg.sessionsBeforeLong = Math.max(1, parseInt(container.querySelector('#pomo-sessions').value) || 4);
            cfg.autoStart          = container.querySelector('#pomo-auto').checked;

            await storageSet(POMO_KEY, cfg);

            clearInterval(interval);
            interval = null;
            running = false;
            hasStarted = false;
            phase = 'work';
            sessionsDone = 0;
            totalSeconds = cfg.workMins * 60;
            remaining = totalSeconds;
            showSettings = false;
            saveState();
            render();
        });

        container.querySelector('.pomo-btn-cancel').addEventListener('click', () => {
            showSettings = false;
            render();
        });
    }

    render();
}
