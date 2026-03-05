// ── Layout / Drag-Drop Module ─────────────────────────────────────────────
// Drag handles live in .grid-module wrappers — completely separate from the
// inner module divs that each module renders into. No innerHTML wipe issues.
// ─────────────────────────────────────────────────────────────────────────

const LAYOUT_KEY = 'dashboard_layout_v1';

const GRID_ICON = `<svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
  <rect x="1"  y="1"  width="5" height="5" rx="1"/>
  <rect x="9"  y="1"  width="5" height="5" rx="1"/>
  <rect x="1"  y="9"  width="5" height="5" rx="1"/>
  <rect x="9"  y="9"  width="5" height="5" rx="1"/>
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

    // ── Hint banner ───────────────────────────────────────────────────────
    const hint = document.createElement('div');
    hint.id = 'layout-hint';
    hint.textContent = 'EDIT MODE  ·  drag cards to reorder  ·  Esc or click 🔒 to save';
    document.body.appendChild(hint);

    // ── Edit toggle button ────────────────────────────────────────────────
    const editBtn = document.createElement('button');
    editBtn.id = 'layout-edit-btn';
    editBtn.title = 'Edit layout';
    editBtn.innerHTML = GRID_ICON;
    document.body.appendChild(editBtn);

    let editMode = false;

    function setEditMode(on) {
        editMode = on;
        grid.classList.toggle('edit-mode', on);
        editBtn.classList.toggle('active', on);
        hint.classList.toggle('visible', on);
        editBtn.title = on ? 'Lock layout' : 'Edit layout';
        if (!on) saveLayout(grid);
    }

    editBtn.addEventListener('click', () => setEditMode(!editMode));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && editMode) setEditMode(false);
    });

    // ── Drag engine ───────────────────────────────────────────────────────
    initDrag(grid, () => saveLayout(grid));
}

// ── Persist ───────────────────────────────────────────────────────────────

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

        // Placeholder
        ph = document.createElement('div');
        ph.className = 'drag-placeholder';
        ph.style.width = rect.width + 'px';
        ph.style.height = rect.height + 'px';
        dragging.after(ph);

        // Floating clone — deep copy so it looks identical
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