// ─── Quick Links Module ────────────────────────────────────────────────────
// Hierarchy: Category → Folder → Link
// Right-click links   → Edit / Delete
// Right-click folder  → Add Link / Rename / Delete
// Right-click cat tab → Rename / Delete
// ─────────────────────────────────────────────────────────────────────────

const QL_STORE = 'quicklinks_v1';

const qlUid = () => Math.random().toString(36).slice(2, 9);
const qlFav = url => { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; } catch { return ''; } };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function qlGet() {
    return new Promise(r => {
        try { chrome.storage.local.get(QL_STORE, d => r(d[QL_STORE] ?? null)); }
        catch { try { r(JSON.parse(localStorage.getItem(QL_STORE))); } catch { r(null); } }
    });
}
function qlSet(v) {
    return new Promise(r => {
        try { chrome.storage.local.set({ [QL_STORE]: v }, r); }
        catch { localStorage.setItem(QL_STORE, JSON.stringify(v)); r(); }
    });
}

// ─── Embedded CSS ─────────────────────────────────────────────────────────
const QL_CSS = `
/* ── Root ─────────────────────────────────────────── */
#ql-root {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

/* ── Category bar ─────────────────────────────────── */
#ql-catbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ql-cat {
  padding: 5px 18px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 999px;
  color: rgba(255,255,255,0.5);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.14s;
  font-family: sans-serif;
}
.ql-cat:hover:not(.ql-cat-on) {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.85);
}
.ql-cat-on {
  background: rgba(79,142,247,0.18);
  border-color: rgba(79,142,247,0.65);
  color: #fff;
}
.ql-cat-add {
  padding: 5px 14px;
  background: none;
  border: 1px dashed rgba(255,255,255,0.18);
  border-radius: 999px;
  color: rgba(255,255,255,0.28);
  font-size: 0.73rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.14s;
  font-family: sans-serif;
}
.ql-cat-add:hover {
  border-color: rgba(255,255,255,0.4);
  color: rgba(255,255,255,0.65);
}

/* ── Body ─────────────────────────────────────────── */
#ql-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ql-empty {
  text-align: center;
  padding: 28px 0;
  opacity: 0.3;
  font-size: 0.83rem;
  font-family: sans-serif;
}

/* ── Folder ──────────────────────────────────────── */
.ql-folder { display: flex; flex-direction: column; gap: 10px; }

.ql-folder-name {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.35;
  font-family: sans-serif;
  user-select: none;
  cursor: default;
  transition: opacity 0.14s;
}
.ql-folder-name:hover { opacity: 0.6; }

/* ── Links row ───────────────────────────────────── */
.ql-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
}

.ql-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 70px;
  text-decoration: none;
  color: #fff;
  border-radius: 12px;
  padding: 6px 4px;
  cursor: pointer;
  transition: background 0.13s;
  -webkit-user-drag: none;
}
.ql-link:hover { background: rgba(255,255,255,0.07); }

.ql-icon {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  background: rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 1.4rem;
  flex-shrink: 0;
}
.ql-icon img { width: 36px; height: 36px; object-fit: contain; }

.ql-lbl {
  font-size: 0.66rem;
  text-align: center;
  line-height: 1.3;
  word-break: break-word;
  max-width: 70px;
  font-family: sans-serif;
  opacity: 0.82;
}

/* ── Add placeholder ─────────────────────────────── */
.ql-add-ph {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 70px;
  cursor: pointer;
  border-radius: 12px;
  padding: 6px 4px;
  transition: background 0.13s;
}
.ql-add-ph:hover { background: rgba(255,255,255,0.04); }
.ql-add-ph:hover .ql-add-box {
  border-color: rgba(255,255,255,0.38);
  color: rgba(255,255,255,0.6);
}
.ql-add-box {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  border: 1.5px dashed rgba(255,255,255,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: rgba(255,255,255,0.22);
  transition: all 0.14s;
}

/* ── Add folder btn ──────────────────────────────── */
.ql-folder-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  background: none;
  border: 1px dashed rgba(255,255,255,0.13);
  border-radius: 8px;
  color: rgba(255,255,255,0.26);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.14s;
  align-self: flex-start;
  font-family: sans-serif;
}
.ql-folder-add-btn:hover {
  border-color: rgba(255,255,255,0.35);
  color: rgba(255,255,255,0.62);
}

/* ── Context menu ────────────────────────────────── */
.ql-ctx {
  position: fixed;
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 5px;
  min-width: 168px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.65);
  z-index: 9999;
  display: none;
  font-family: sans-serif;
}
.ql-ctx.open { display: block; }
.ql-ctx-item {
  padding: 8px 12px;
  font-size: 0.81rem;
  color: rgba(255,255,255,0.85);
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}
.ql-ctx-item:hover { background: rgba(255,255,255,0.1); }
.ql-ctx-item.danger { color: #ff8080; }
.ql-ctx-item.danger:hover { background: rgba(255,80,80,0.15); }
.ql-ctx-sep { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0; }

/* ── Modal ───────────────────────────────────────── */
#ql-modal-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 10000;
  display: none;
  align-items: center;
  justify-content: center;
}
#ql-modal-wrap.open { display: flex; }

.ql-modal {
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
  padding: 1.5rem;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7);
}
.ql-modal h3 { margin: 0; font-size: 0.95rem; font-weight: 600; color: #fff; font-family: sans-serif; }

.ql-mfield { display: flex; flex-direction: column; gap: 5px; }
.ql-mfield label {
  font-size: 0.69rem;
  color: rgba(255,255,255,0.38);
  font-family: sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ql-minput {
  background: #111;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  color: #fff;
  font-size: 0.83rem;
  padding: 8px 10px;
  outline: none;
  transition: border-color 0.18s;
  width: 100%;
  box-sizing: border-box;
  font-family: sans-serif;
}
.ql-minput:focus { border-color: rgba(255,255,255,0.35); }

.ql-mprev {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  padding: 8px 10px;
}
.ql-mprev-icon {
  width: 38px; height: 38px;
  border-radius: 10px;
  background: rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; flex-shrink: 0;
}
.ql-mprev-icon img { width: 28px; height: 28px; object-fit: contain; }
.ql-mprev-name {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.75);
  font-family: sans-serif;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.ql-mactions { display: flex; gap: 8px; }
.ql-mbtn {
  flex: 1; padding: 9px; border: none; border-radius: 8px;
  font-size: 0.82rem; font-weight: 600; cursor: pointer;
  transition: opacity 0.14s; font-family: sans-serif;
}
.ql-mbtn:hover { opacity: 0.85; }
.ql-mbtn-p { background: #4f8ef7; color: #fff; }
.ql-mbtn-s { background: rgba(255,255,255,0.08); color: #fff; }
`;

// ─── Module entry point ────────────────────────────────────────────────────
export async function initQuicklinks(el) {
    let data = await qlGet() ?? { activeId: null, cats: [] };
    if (!data.cats.find(c => c.id === data.activeId))
        data.activeId = data.cats[0]?.id ?? null;

    // Inject styles once
    if (!document.getElementById('ql-css')) {
        const s = Object.assign(document.createElement('style'), { id: 'ql-css', textContent: QL_CSS });
        document.head.appendChild(s);
    }

    el.innerHTML = `
    <div id="ql-root">
      <div id="ql-body"></div>
      <div id="ql-catbar"></div>
    </div>
    <div class="ql-ctx" id="ql-ctx"></div>
    <div id="ql-modal-wrap"></div>`;

    const ctxEl = document.getElementById('ql-ctx');
    const modalWrap = document.getElementById('ql-modal-wrap');

    const save = () => qlSet(data);
    const activeCat = () => data.cats.find(c => c.id === data.activeId);

    // ── Draw ──────────────────────────────────────────────────────────────

    function draw() { drawCatbar(); drawBody(); }

    function drawCatbar() {
        const bar = document.getElementById('ql-catbar');
        if (!bar) return;
        bar.innerHTML =
            data.cats.map(c =>
                `<button class="ql-cat${c.id === data.activeId ? ' ql-cat-on' : ''}" data-id="${c.id}">${esc(c.name)}</button>`
            ).join('') +
            `<button class="ql-cat-add" id="ql-cat-add">＋ Category</button>`;

        bar.querySelectorAll('.ql-cat').forEach(btn => {
            btn.addEventListener('click', () => { data.activeId = btn.dataset.id; save(); drawCatbar(); drawBody(); });
            btn.addEventListener('contextmenu', e => { e.preventDefault(); catCtx(e, btn.dataset.id); });
        });
        document.getElementById('ql-cat-add')?.addEventListener('click', () => openModal({ type: 'cat' }));
    }

    function drawBody() {
        const body = document.getElementById('ql-body');
        if (!body) return;
        const cat = activeCat();

        if (!cat) {
            body.innerHTML = `<div class="ql-empty">No category selected — add one below ↓</div>`;
            return;
        }

        body.innerHTML =
            cat.folders.map(f => `
        <div class="ql-folder" data-fid="${f.id}">
          <span class="ql-folder-name" data-fid="${f.id}">${esc(f.name)}</span>
          <div class="ql-links" data-fid="${f.id}">
            ${f.links.map(l => linkHtml(l, f.id)).join('')}
            <div class="ql-add-ph" data-fid="${f.id}">
              <div class="ql-add-box">＋</div>
              <span class="ql-lbl" style="opacity:.28">Add</span>
            </div>
          </div>
        </div>`
            ).join('') +
            `<button class="ql-folder-add-btn" id="ql-add-folder">＋ Add Folder</button>`;

        // Link clicks & right-clicks
        body.querySelectorAll('.ql-link').forEach(a => {
            a.addEventListener('click', e => { e.preventDefault(); window.open(a.dataset.url, '_blank'); });
            a.addEventListener('contextmenu', e => { e.preventDefault(); linkCtx(e, a.dataset.fid, a.dataset.lid); });
        });

        // Folder name right-click
        body.querySelectorAll('.ql-folder-name').forEach(span =>
            span.addEventListener('contextmenu', e => { e.preventDefault(); folderCtx(e, span.dataset.fid); })
        );

        // Add-link placeholder
        body.querySelectorAll('.ql-add-ph').forEach(div =>
            div.addEventListener('click', () => openModal({ type: 'link', catId: cat.id, folderId: div.dataset.fid }))
        );

        document.getElementById('ql-add-folder')?.addEventListener('click', () =>
            openModal({ type: 'folder', catId: cat.id })
        );
    }

    function linkHtml(l, fid) {
        const icon = l.iconUrl || qlFav(l.url);
        return `<a class="ql-link" data-lid="${l.id}" data-fid="${fid}" data-url="${esc(l.url)}" href="${esc(l.url)}" title="${esc(l.title)}">
      <div class="ql-icon"><img src="${esc(icon)}" onerror="this.parentElement.textContent='🔗'" alt=""></div>
      <span class="ql-lbl">${esc(l.title)}</span>
    </a>`;
    }

    // ── Context menu ───────────────────────────────────────────────────────

    let iH = {}; // action handlers

    function openCtx(e, items) {
        ctxEl.innerHTML = items.map(i =>
            i.sep ? `<div class="ql-ctx-sep"></div>`
                : `<div class="ql-ctx-item${i.danger ? ' danger' : ''}" data-a="${i.a}">${i.label}</div>`
        ).join('');

        ctxEl.style.cssText = `left:${e.clientX}px;top:${e.clientY}px`;
        ctxEl.classList.add('open');

        // Clamp to viewport
        requestAnimationFrame(() => {
            const r = ctxEl.getBoundingClientRect();
            if (r.right > innerWidth) ctxEl.style.left = (innerWidth - r.width - 8) + 'px';
            if (r.bottom > innerHeight) ctxEl.style.top = (innerHeight - r.height - 8) + 'px';
        });

        ctxEl.querySelectorAll('.ql-ctx-item').forEach(el =>
            el.addEventListener('click', ev => { ev.stopPropagation(); iH[el.dataset.a]?.(); closeCtx(); })
        );
        setTimeout(() => document.addEventListener('click', closeCtx, { once: true }), 0);
    }

    function closeCtx() { ctxEl.classList.remove('open'); }

    function linkCtx(e, fid, lid) {
        iH = {
            edit: () => {
                const cat = activeCat(), f = cat?.folders.find(f => f.id === fid), l = f?.links.find(l => l.id === lid);
                if (l) openModal({ type: 'link', catId: cat.id, folderId: fid, edit: l });
            },
            del: () => {
                const cat = activeCat(), f = cat?.folders.find(f => f.id === fid);
                if (f) { f.links = f.links.filter(l => l.id !== lid); save(); drawBody(); }
            }
        };
        openCtx(e, [
            { label: '✏️  Edit Link', a: 'edit' },
            { sep: true },
            { label: '🗑  Delete Link', a: 'del', danger: true }
        ]);
    }

    function folderCtx(e, fid) {
        const cat = activeCat();
        iH = {
            addlnk: () => openModal({ type: 'link', catId: cat?.id, folderId: fid }),
            rename: () => { const f = cat?.folders.find(f => f.id === fid); if (f) openModal({ type: 'folder', catId: cat.id, edit: f }); },
            del: () => { if (cat) { cat.folders = cat.folders.filter(f => f.id !== fid); save(); drawBody(); } }
        };
        openCtx(e, [
            { label: '＋  Add Link', a: 'addlnk' },
            { label: '✏️  Rename Folder', a: 'rename' },
            { sep: true },
            { label: '🗑  Delete Folder', a: 'del', danger: true }
        ]);
    }

    function catCtx(e, catId) {
        iH = {
            rename: () => { const c = data.cats.find(c => c.id === catId); if (c) openModal({ type: 'cat', edit: c }); },
            del: () => {
                data.cats = data.cats.filter(c => c.id !== catId);
                if (data.activeId === catId) data.activeId = data.cats[0]?.id ?? null;
                save(); draw();
            }
        };
        openCtx(e, [
            { label: '✏️  Rename', a: 'rename' },
            { sep: true },
            { label: '🗑  Delete Category', a: 'del', danger: true }
        ]);
    }

    // ── Modal ──────────────────────────────────────────────────────────────

    function openModal(opts) {
        const { type, edit } = opts;
        let body = '';

        if (type === 'link') {
            const l = edit;
            body = `
        <h3>${l ? 'Edit' : 'Add'} Link</h3>
        <div class="ql-mfield">
          <label>Title</label>
          <input class="ql-minput" id="m-title" placeholder="YouTube" value="${esc(l?.title || '')}">
        </div>
        <div class="ql-mfield">
          <label>URL</label>
          <input class="ql-minput" id="m-url" placeholder="https://youtube.com" value="${esc(l?.url || '')}">
        </div>
        <div class="ql-mfield">
          <label>Icon URL <span style="opacity:.38;text-transform:none;letter-spacing:0">(optional — auto if blank)</span></label>
          <input class="ql-minput" id="m-icon" placeholder="Leave blank for auto-detect" value="${esc(l?.iconUrl || '')}">
        </div>
        <div class="ql-mprev" id="m-prev" style="display:none">
          <div class="ql-mprev-icon"><img id="m-pimg" src="" alt=""></div>
          <span class="ql-mprev-name" id="m-pname"></span>
        </div>`;
        } else if (type === 'folder') {
            body = `
        <h3>${edit ? 'Rename' : 'Add'} Folder</h3>
        <div class="ql-mfield">
          <label>Name</label>
          <input class="ql-minput" id="m-name" placeholder="My Folder" value="${esc(edit?.name || '')}">
        </div>`;
        } else {
            body = `
        <h3>${edit ? 'Rename' : 'Add'} Category</h3>
        <div class="ql-mfield">
          <label>Name</label>
          <input class="ql-minput" id="m-name" placeholder="SOCIALS" value="${esc(edit?.name || '')}">
        </div>`;
        }

        modalWrap.innerHTML = `
      <div class="ql-modal">
        ${body}
        <div class="ql-mactions">
          <button class="ql-mbtn ql-mbtn-p" id="m-save">Save</button>
          <button class="ql-mbtn ql-mbtn-s" id="m-cancel">Cancel</button>
        </div>
      </div>`;
        modalWrap.classList.add('open');
        setTimeout(() => modalWrap.querySelector('.ql-minput')?.focus(), 30);

        // Live icon/title preview for link type
        if (type === 'link') {
            const upd = () => {
                const url = document.getElementById('m-url')?.value.trim();
                const icon = document.getElementById('m-icon')?.value.trim() || qlFav(url || '');
                const title = document.getElementById('m-title')?.value.trim();
                const prev = document.getElementById('m-prev');
                if (prev && (url || icon)) {
                    prev.style.display = 'flex';
                    document.getElementById('m-pimg').src = icon;
                    document.getElementById('m-pname').textContent = title || url || '';
                }
            };
            ['m-url', 'm-icon', 'm-title'].forEach(id => document.getElementById(id)?.addEventListener('input', upd));
            if (edit) upd();
        }

        // Save logic
        document.getElementById('m-save')?.addEventListener('click', () => {
            if (type === 'link') {
                let url = document.getElementById('m-url')?.value.trim();
                if (!url) { document.getElementById('m-url')?.focus(); return; }
                if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) url = 'https://' + url;
                let title = document.getElementById('m-title')?.value.trim();
                if (!title) { try { title = new URL(url).hostname; } catch { title = url; } }
                const iconUrl = document.getElementById('m-icon')?.value.trim() || '';
                const cat = data.cats.find(c => c.id === opts.catId);
                const folder = cat?.folders.find(f => f.id === opts.folderId);
                if (!folder) return;
                if (edit) {
                    const lnk = folder.links.find(l => l.id === edit.id);
                    if (lnk) Object.assign(lnk, { title, url, iconUrl });
                } else {
                    folder.links.push({ id: qlUid(), title, url, iconUrl });
                }
                save(); closeModal(); drawBody();

            } else if (type === 'folder') {
                const name = document.getElementById('m-name')?.value.trim();
                if (!name) { document.getElementById('m-name')?.focus(); return; }
                const cat = data.cats.find(c => c.id === opts.catId);
                if (!cat) return;
                if (edit) {
                    const f = cat.folders.find(f => f.id === edit.id);
                    if (f) f.name = name;
                } else {
                    cat.folders.push({ id: qlUid(), name, links: [] });
                }
                save(); closeModal(); drawBody();

            } else {
                const name = document.getElementById('m-name')?.value.trim().toUpperCase();
                if (!name) { document.getElementById('m-name')?.focus(); return; }
                if (edit) {
                    const c = data.cats.find(c => c.id === edit.id);
                    if (c) c.name = name;
                } else {
                    const nc = { id: qlUid(), name, folders: [] };
                    data.cats.push(nc);
                    data.activeId = nc.id;
                }
                save(); closeModal(); draw();
            }
        });

        document.getElementById('m-cancel')?.addEventListener('click', closeModal);
        modalWrap.addEventListener('click', e => { if (e.target === modalWrap) closeModal(); });
        modalWrap.querySelectorAll('.ql-minput').forEach(inp =>
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('m-save')?.click(); })
        );
    }

    function closeModal() { modalWrap.classList.remove('open'); modalWrap.innerHTML = ''; }

    draw();
}