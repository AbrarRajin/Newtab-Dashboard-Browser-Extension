# Weather – Custom CSS Guide

The weather module includes a built-in CSS editor that lets you restyle the widget without touching any source files. Changes are saved automatically and persist across sessions.

---

## How to Use

1. Open a new tab
2. Click the **⚙** button on the weather widget
3. Scroll to the **Custom CSS** section
4. Write your CSS in the textarea
5. Click **Save & Reload** to apply changes
6. To reset, clear the textarea and click **Save & Reload**

---

## Targetable Elements

| Selector | What it controls |
|---|---|
| `.weather-module` | The outer card (background, border, shadow, size) |
| `.w-location` | City and country name at the top |
| `.w-temp-main` | The large current temperature number |
| `.w-condition` | The weather description text (e.g. "light rain") |
| `.w-meta` | Humidity and wind speed row |
| `.w-icon-lg` | The large current weather icon |
| `.w-forecast` | The 5-day forecast row container |
| `.w-day` | Individual day column in the forecast |
| `.w-day-name` | Day label (e.g. "MON") |
| `.w-day-high` | High temperature in the forecast |
| `.w-day-low` | Low temperature in the forecast |
| `.w-icon-sm` | Small forecast icons |
| `.w-btn-icon` | The ⚙ gear button |

---

## What You Can Change

### Background & Border
```css
.weather-module {
  background: rgba(20, 20, 40, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
}
```

### Colors
```css
.w-temp-main  { color: #ff6b6b; }
.w-location   { color: #ffd93d; }
.w-condition  { color: #a0c4ff; }
.w-day-high   { color: #ff6b6b; }
.w-day-low    { color: #888; }
```

### Font Family

**Web-safe (no import needed):**
```css
.weather-module {
  font-family: 'Georgia', serif;
}
```

**Google Fonts via `@import`:**
```css
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');

.w-temp-main,
.w-location,
.w-day-name {
  font-family: 'Orbitron', sans-serif;
}
```

> Recommended Google Fonts for a dashboard: `Orbitron`, `Share Tech Mono`, `Rajdhani`, `Exo 2`

### Glow / Text Shadow
```css
.w-temp-main {
  text-shadow:
    0 0 8px #bf00ff,
    0 0 20px #bf00ff,
    0 0 50px #8000ff;
}
```

### Card Glow (Box Shadow)
```css
.weather-module {
  box-shadow:
    0 0 12px rgba(191, 0, 255, 0.3),
    0 0 40px rgba(128, 0, 255, 0.15);
}
```

### Size & Spacing
```css
.weather-module { width: 360px; padding: 28px; }
.w-temp-main    { font-size: 4rem; }
```

---

## Scope

The custom CSS is injected into a `<style>` tag on the page, so it can affect the **entire page** — not just the weather widget. This means you can also target clock elements or `body` if needed. Be mindful of this when writing broad selectors.

---

## Included Themes

Ready-made themes are available in the `themes/` folder. To use one, open the file, copy its contents, and paste into the CSS editor.

| File | Description |
|---|---|
| `themes/weather-neon-purple.css` | Deep purple glow with Orbitron font, matches the clock neon purple theme |

---

## Example – Neon Purple Theme

```css
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&display=swap');

.weather-module {
  background: rgba(80, 0, 120, 0.15);
  border: 1px solid rgba(191, 0, 255, 0.3);
  box-shadow:
    0 0 12px rgba(191, 0, 255, 0.2),
    0 0 40px rgba(128, 0, 255, 0.1);
}

.w-temp-main {
  font-family: 'Orbitron', sans-serif;
  color: #df80ff;
  text-shadow:
    0 0 8px #bf00ff,
    0 0 20px #bf00ff,
    0 0 50px #8000ff,
    0 0 100px #5c00b8;
}

.w-location {
  font-family: 'Orbitron', sans-serif;
  color: #c060ff;
  text-shadow: 0 0 6px #9900cc, 0 0 18px #6600aa;
}
```

---

## Tips

- Use browser DevTools (`F12`) on the new tab page to inspect element class names and experiment with styles live before pasting them into the editor.
- The weather icons are images fetched from OpenWeatherMap — you can reposition or resize them with CSS but cannot recolor them.
- If you apply a `font-family` via `@import`, the font requires an internet connection to load. It will fall back to the default font when offline.
- Both the clock and weather modules share the page, so a `body` rule in either editor will affect both.
