# Quick Links — Custom CSS Guide

Access the CSS editor via the **⚙** button at the right end of the category bar.
Your CSS is saved to `chrome.storage.local` under the key `ql_custom_css` and
applied every time the module loads. Changes take effect immediately on Save.

---

## Targetable selectors

| Selector | What it targets |
|---|---|
| `#ql-root` | Outermost wrapper (flex column, full width) |
| `#ql-catbar` | The pill-shaped category tab bar |
| `.ql-cat` | Individual category tab buttons |
| `.ql-cat-on` | The currently active category tab |
| `.ql-cat-add` | The ＋ add-category button |
| `#ql-body` | Area below the catbar that holds all folders |
| `.ql-folder` | A single folder block |
| `.ql-folder-name` | The folder label (uppercase, muted) |
| `.ql-links` | The flex row of links inside a folder |
| `.ql-link` | A single link tile (icon + label) |
| `.ql-icon` | The icon container square |
| `.ql-icon img` | The favicon `<img>` inside the icon container |
| `.ql-lbl` | The text label below an icon |
| `.ql-add-ph` | The dashed "＋ Add" placeholder tile |
| `.ql-add-box` | The dashed square inside the add placeholder |
| `.ql-drag-ph` | The blue dashed drop-slot shown while dragging |
| `.ql-ctx` | The context menu popup |
| `.ql-ctx-item` | A context menu row |
| `.ql-modal` | The add/edit/rename modal dialog |

---

## Tips

- Use `!important` sparingly — only when overriding a property that's already
  defined on the same element with a competing specificity.
- Glassmorphism values like `backdrop-filter: blur()` require the element to
  have a semi-transparent background, not `background: none`.
- The catbar uses `border-radius: 999px` and `backdrop-filter` by default.
  To make it rectangular just override `border-radius: 8px`.
- Icon size is controlled by `.ql-icon` (width/height) and `.ql-icon img`.
  The link tile width is set on `.ql-link` (`width: 70px` by default).

---

## Demo themes

### 1 — Neon Accent (purple/pink)

```css
/* Category bar */
#ql-catbar {
  background: rgba(40, 10, 60, 0.75);
  border-color: rgba(180, 80, 255, 0.35);
  box-shadow: 0 0 0 1px rgba(180, 80, 255, 0.15), 0 4px 24px rgba(0, 0, 0, 0.4);
}

/* Inactive tabs */
.ql-cat {
  color: rgba(220, 180, 255, 0.65);
}
.ql-cat:hover:not(.ql-cat-on) {
  color: rgba(230, 200, 255, 0.95);
}

/* Active tab */
.ql-cat-on {
  background: linear-gradient(135deg, #9f4fff, #e040fb);
  color: #fff;
  box-shadow: 0 2px 10px rgba(160, 50, 255, 0.5);
}

/* Icon container */
.ql-icon {
  border-radius: 16px;
  background: rgba(160, 60, 255, 0.12);
  box-shadow: inset 0 0 0 1px rgba(180, 80, 255, 0.2);
}

/* Hover glow on icons */
.ql-link:hover .ql-icon img {
  filter: brightness(1.15) drop-shadow(0 2px 8px rgba(200, 100, 255, 0.5));
}

/* Folder name */
.ql-folder-name {
  color: #c084fc;
  letter-spacing: 0.15em;
}

/* Add placeholder border */
.ql-add-box {
  border-color: rgba(180, 80, 255, 0.3);
  color: rgba(200, 120, 255, 0.4);
}
.ql-add-ph:hover .ql-add-box {
  border-color: rgba(200, 120, 255, 0.65);
  color: rgba(200, 120, 255, 0.8);
}
```

---

### 2 — Warm Amber (coffee / sunset)

```css
#ql-catbar {
  background: rgba(50, 25, 5, 0.8);
  border-color: rgba(255, 160, 50, 0.3);
  box-shadow: 0 0 0 1px rgba(255, 140, 30, 0.1), 0 4px 20px rgba(0, 0, 0, 0.35);
}

.ql-cat { color: rgba(255, 200, 120, 0.6); }
.ql-cat:hover:not(.ql-cat-on) { color: rgba(255, 210, 140, 0.95); }

.ql-cat-on {
  background: linear-gradient(135deg, #f59e0b, #fb923c);
  color: #1c0a00;
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.45);
}

.ql-folder-name { color: #fbbf24; }

.ql-icon {
  border-radius: 14px;
  background: rgba(245, 158, 11, 0.1);
  box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.18);
}

.ql-link:hover .ql-icon img {
  filter: brightness(1.1) drop-shadow(0 2px 8px rgba(250, 160, 30, 0.45));
}

.ql-add-box {
  border-color: rgba(245, 158, 11, 0.25);
  color: rgba(245, 158, 11, 0.35);
}
.ql-add-ph:hover .ql-add-box {
  border-color: rgba(245, 158, 11, 0.6);
  color: rgba(245, 158, 11, 0.75);
}
```

---

### 3 — Minimal Frosted (clean / light-tinted glass)

```css
#ql-catbar {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: none;
}

.ql-cat { color: rgba(255, 255, 255, 0.45); font-weight: 400; }
.ql-cat:hover:not(.ql-cat-on) { color: rgba(255, 255, 255, 0.85); }

.ql-cat-on {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-weight: 500;
  box-shadow: none;
}

.ql-folder-name { opacity: 0.2; letter-spacing: 0.18em; }

.ql-icon {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.ql-lbl { opacity: 0.55; }

.ql-add-box { border-color: rgba(255, 255, 255, 0.08); }
```

---

### 4 — Compact Grid (smaller icons, tighter layout)

```css
#ql-root { gap: 10px; }

.ql-link { width: 54px; gap: 3px; }
.ql-icon { width: 42px; height: 42px; border-radius: 10px; }
.ql-icon img { width: 30px; height: 30px; }
.ql-lbl { font-size: 0.6rem; max-width: 54px; }

.ql-links { gap: 7px; }
#ql-body { gap: 14px; }
```
