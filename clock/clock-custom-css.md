# Clock — Custom CSS Guide

The clock module includes a built-in CSS editor that lets you restyle the clock and page without touching any source files. Changes are saved automatically and persist across sessions.

---

## How to Use

1. Open a new tab
2. Click the **⚙** button in the bottom-right corner
3. Scroll to the **Custom CSS** section
4. Write your CSS in the textarea
5. Click **Apply** to see changes instantly
6. Click **Reset** to clear all custom styles and return to defaults

---

## Targetable Elements

| Selector | What it controls |
|---|---|
| `#clock-time` | The time display (e.g. `14:35:22`) |
| `#clock-date` | The date display (e.g. `Wednesday, February 18`) |
| `#clock-wrapper` | The container wrapping both time and date |
| `body` | The full page background and base styles |

---

## What You Can Change

### Colors
```css
#clock-time { color: #ff6b6b; }
#clock-date { color: #ffd93d; }
body        { background: #1a1a2e; }
```

### Font Size
```css
#clock-time { font-size: 8rem; }
#clock-date { font-size: 1.8rem; }
```

### Font Family

**Web-safe (no import needed):**
```css
#clock-time, #clock-date {
  font-family: 'Georgia', serif;
}
```

**Google Fonts via `@import`:**
```css
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap');

#clock-time, #clock-date {
  font-family: 'Orbitron', sans-serif;
}
```

> Recommended Google Fonts for a clock: `Orbitron`, `Share Tech Mono`, `Rajdhani`, `Oswald`

### Glow / Text Shadow
```css
#clock-time {
  text-shadow:
    0 0 8px #bf00ff,
    0 0 20px #bf00ff,
    0 0 50px #8000ff;
}
```

### Spacing & Layout
```css
#clock-time    { letter-spacing: 0.1em; }
#clock-date    { margin-top: 1rem; opacity: 0.8; }
#clock-wrapper { transform: translateY(-2rem); }
```

---

## Scope

The custom CSS is injected into a `<style>` tag on the page, so it can affect the **entire page** — not just the clock. This means `body` rules (background, font, etc.) work as expected. Other module elements can also be targeted if you know their selectors.

---

## Included Themes

Ready-made themes are available in the `themes/` folder. To use one, open the file, copy its contents, and paste into the CSS editor.

| File | Description |
|---|---|
| `themes/clock-neon-purple.css` | Deep purple background with glowing purple neon text, uses Orbitron font |

---

## Example — Neon Purple Theme

```css
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap');

body {
  background: #0d0010;
}

#clock-time {
  font-family: 'Orbitron', sans-serif;
  font-size: 6rem;
  color: #df80ff;
  text-shadow:
    0 0 8px #bf00ff,
    0 0 20px #bf00ff,
    0 0 50px #8000ff,
    0 0 100px #5c00b8;
  letter-spacing: 0.08em;
}

#clock-date {
  font-family: 'Orbitron', sans-serif;
  color: #c060ff;
  opacity: 0.85;
  text-shadow:
    0 0 6px #9900cc,
    0 0 18px #6600aa;
  letter-spacing: 0.25em;
}
```
