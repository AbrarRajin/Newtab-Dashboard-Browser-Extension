// ── Layout / Drag-Drop Module ─────────────────────────────────────────────
// Drag handles live in .grid-module wrappers — completely separate from the
// inner module divs that each module renders into. No innerHTML wipe issues.
// ─────────────────────────────────────────────────────────────────────────

const LAYOUT_KEY     = 'dashboard_layout_v1';
const VISIBILITY_KEY = 'dashboard_modules_v1';

const MODULE_LABELS = {
    'gm-weather':  'Weather',
    'gm-gmail':    'Gmail',
    'gm-football': 'Football',
    'gm-pomodoro': 'Pomodoro',
    'gm-calendar': 'Calendar',
};

const MODULES_ICON = `<svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
  <rect x="1" y="1" width="13" height="3" rx="1.5"/>
  <rect x="1" y="6" width="13" height="3" rx="1.5"/>
  <rect x="1" y="11" width="13" height="3" rx="1.5"/>
</svg>`;

// ── Storage ───────────────────────────────────────────────────────────────

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

// ── Entry point ───────────────────────────────────────────────────────────

export async function initLayout() {
    const grid = document.getElementById('modules-grid');
    if (!grid) return;

    // Inject stylesheet
    const link = Object.assign(document.createElement('link'), {
        rel: 'stylesheet', href: 'modules/layout/layout.css',
    });
    document.head.appendChild(link);

    // ── Restore saved order before modules render ─────────────────────────
    const savedOrder = await storageGet(LAYOUT_KEY);
    if (Array.isArray(savedOrder) && savedOrder.length) {
        const wrappers = [...grid.children];
        const reordered = [
            ...savedOrder.map(id => wrappers.find(w => w.id === id)).filter(Boolean),
            ...wrappers.filter(w => !savedOrder.includes(w.id)),
        ];
        reordered.forEach(w => grid.appendChild(w));
    }

    // ── Restore module visibility ─────────────────────────────────────────
    const savedVisibility = await storageGet(VISIBILITY_KEY) || {};
    applyVisibility(grid, savedVisibility);

    // ── Hint banner ───────────────────────────────────────────────────────
    const hint = document.createElement('div');
    hint.id = 'layout-hint';
    hint.textContent = 'EDIT MODE  ·  drag cards to reorder  ·  Esc or toggle off to save';
    document.body.appendChild(hint);

    // ── Modules toggle button ─────────────────────────────────────────────
    const modulesBtn = document.createElement('button');
    modulesBtn.id = 'modules-toggle-btn';
    modulesBtn.title = 'Modules';
    modulesBtn.innerHTML = MODULES_ICON;
    document.body.appendChild(modulesBtn);

    // ── Modules panel ─────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.id = 'modules-panel';
    document.body.appendChild(panel);

    let panelOpen = false;
    let editMode  = false;

    // ── Edit mode ─────────────────────────────────────────────────────────

    function setEditMode(on) {
        editMode = on;
        grid.classList.toggle('edit-mode', on);
        hint.classList.toggle('visible', on);
        if (!on) saveLayout(grid);
        // Keep the panel checkbox in sync (e.g. when Esc is pressed)
        const editCheck = panel.querySelector('.mp-edit-check');
        if (editCheck) editCheck.checked = on;
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && editMode) setEditMode(false);
    });

    // ── Panel open / close ────────────────────────────────────────────────

    function openPanel() {
        panelOpen = true;
        modulesBtn.classList.add('active');
        renderPanel(grid, panel, savedVisibility, () => editMode, setEditMode);
        panel.classList.add('visible');
    }

    function closePanel() {
        panelOpen = false;
        modulesBtn.classList.remove('active');
        panel.classList.remove('visible');
    }

    modulesBtn.addEventListener('click', () => {
        if (panelOpen) closePanel(); else openPanel();
    });

    document.addEventListener('click', e => {
        if (panelOpen && !panel.contains(e.target) && e.target !== modulesBtn) {
            closePanel();
        }
    });

    // ── Drag engine ───────────────────────────────────────────────────────
    initDrag(grid, () => saveLayout(grid));
}

// ── Apply visibility to grid wrappers ─────────────────────────────────────

function applyVisibility(grid, visibility) {
    for (const wrapper of grid.children) {
        if (!wrapper.id) continue;
        const visible = visibility[wrapper.id] !== false;
        wrapper.style.display = visible ? '' : 'none';
    }
}

// ── Render the modules panel ───────────────────────────────────────────────

function renderPanel(grid, panel, visibility, getEditMode, setEditMode) {
    const wrappers = [...grid.children].filter(w => w.id);

    panel.innerHTML = `
<div class="mp-header">
  <span class="mp-title">Modules</span>
</div>
<ul class="mp-list">
  <li class="mp-row">
    <span class="mp-label">Edit Layout</span>
    <label class="mp-switch">
      <input type="checkbox" class="mp-check mp-edit-check" ${getEditMode() ? 'checked' : ''}>
      <span class="mp-slider"></span>
    </label>
  </li>
  <li class="mp-divider"></li>
  ${wrappers.map(w => {
      const label = MODULE_LABELS[w.id] || w.id.replace('gm-', '');
      const visible = visibility[w.id] !== false;
      return `
  <li class="mp-row" data-id="${w.id}">
    <span class="mp-label">${label}</span>
    <label class="mp-switch">
      <input type="checkbox" class="mp-check" ${visible ? 'checked' : ''}>
      <span class="mp-slider"></span>
    </label>
  </li>`;
  }).join('')}
</ul>`;

    panel.querySelector('.mp-edit-check').addEventListener('change', e => {
        setEditMode(e.target.checked);
    });

    panel.querySelectorAll('.mp-row[data-id] .mp-check').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const id = checkbox.closest('.mp-row').dataset.id;
            visibility[id] = checkbox.checked;
            storageSet(VISIBILITY_KEY, visibility);
            applyVisibility(grid, visibility);
        });
    });
}

// ── Persist layout ────────────────────────────────────────────────────────

function saveLayout(grid) {
    const order = [...grid.children].map(w => w.id).filter(Boolean);
    storageSet(LAYOUT_KEY, order);
}

// ── Drag engine ───────────────────────────────────────────────────────────

function initDrag(grid, onDrop) {
    let dragging = null;
    let clone = null;
    let ph = null;
    let ox = 0, oy = 0;

    grid.addEventListener('mousedown', e => {
        if (!grid.classList.contains('edit-mode')) return;
        const handle = e.target.closest('.drag-handle');
        if (!handle) return;
        e.preventDefault();

        dragging = handle.closest('.grid-module');
        if (!dragging) return;

        const rect = dragging.getBoundingClientRect();
        ox = e.clientX - rect.left;
        oy = e.clientY - rect.top;

        ph = document.createElement('div');
        ph.className = 'drag-placeholder';
        ph.style.width = rect.width + 'px';
        ph.style.height = rect.height + 'px';
        dragging.after(ph);

        clone = dragging.cloneNode(true);
        clone.removeAttribute('id');
        clone.classList.add('drag-clone');
        Object.assign(clone.style, {
            left: rect.left + 'px',
            top: rect.top + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px',
        });
        document.body.appendChild(clone);

        dragging.classList.add('is-dragging');
    });

    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        clone.style.left = (e.clientX - ox) + 'px';
        clone.style.top = (e.clientY - oy) + 'px';
        movePlaceholder(grid, ph, dragging, e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging.classList.remove('is-dragging');
        ph.replaceWith(dragging);
        clone.remove();
        dragging = clone = ph = null;
        onDrop();
    });
}

// ── Placeholder positioning ───────────────────────────────────────────────

function movePlaceholder(grid, ph, dragging, mx, my) {
    const items = [...grid.children].filter(el => el !== ph && el !== dragging);

    let target = null;
    for (const item of items) {
        const r = item.getBoundingClientRect();
        if (my < r.top + r.height / 2) { target = item; break; }
        if (my < r.bottom && mx < r.left + r.width / 2) { target = item; break; }
    }

    if (ph.nextSibling !== target) {
        if (target) grid.insertBefore(ph, target);
        else grid.appendChild(ph);
    }
}
