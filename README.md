# Watch Town

A 3D watch-time ledger. Log the long videos you're working through (lectures, courses), deduct sections as you watch, and a small night-time street shows how far you've come:

- **Street lamps light up one by one** as you near the end of a video (or the whole day, in Day mode).
- The **theater marquee** shows the time left, and the **parapet clock** turns to your progress.
- **Bartholomew**, a monocled gentleman, walks down the sidewalk to your place in the video.
- Finishing a video opens the doors and brings out his friends; finishing the day adds fireworks and lights every window.

It continues the 2D "Marquee Watch Ledger" widget and uses the same data, so both read the same ledger.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
npm run preview  # serve dist/ locally
```

Vite, vanilla JavaScript, [three.js](https://threejs.org) and [GSAP](https://gsap.com). There's no backend. Fonts (EB Garamond, Pinyon Script) come from Google Fonts, and every texture is drawn on a canvas at runtime.

## Deploy and embed in Notion

`npm run build` writes a static `dist/` folder. Asset paths are relative (`base: './'`), so it works from any path.

- **Netlify:** drag `dist/` onto the Netlify dashboard, or set the build command to `npm run build` and the publish directory to `dist`.
- **Vercel:** import the repo; it detects Vite. The output directory is `dist`.
- **GitHub Pages:** push the contents of `dist/` to a `gh-pages` branch, or use a Pages workflow that runs `npm ci && npm run build` and uploads `dist/`.

In Notion, type `/embed` and paste the deployed URL. Drag the embed's corner to make it tall enough (about 700 px is comfortable). Below 760 px wide the panel becomes a bottom sheet you can drag between peek, half and full.

Inside an embed, some browsers block storage or downloads:

- If `localStorage` is blocked, the ledger still works for the session, but nothing is saved.
- If the screenshot download is blocked, the picture is shown on screen so you can save it by hand.
- If the native date picker is refused, a plain date field appears instead.

## Data

The ledger is stored in `localStorage` under **`watch-time-budget-v3`**, in the same format as the 2D widget:

```json
{
  "days": {
    "2026-10-10": {
      "example": true,
      "videos": [
        { "id": "lq3k9a1x", "title": "Module 3 lecture", "total": 7200,
          "entries": [ { "sec": 900, "note": "Intro and course overview" } ] }
      ]
    }
  },
  "sel": { "2026-10-10": "lq3k9a1x" }
}
```

All times are whole seconds. Date keys are local `YYYY-MM-DD`, and `sel` maps each date to its selected video. On first run, today is seeded with three example videos marked `example: true`. Any real edit removes the flag.

Environment settings (time of night, fog, lamps, weather and so on) are kept separately under `watch-town-settings-v1`.

## Layout

```
index.html, styles.css
src/main.js              boot: store, scene, panel, wiring
src/state/store.js       data model, persistence, change events
src/state/settings.js    environment settings + persistence
src/scene/renderer.js    renderer, bloom composer, resize, loop (pauses when hidden)
src/scene/town.js        ground, sidewalk, buildings, the picture house, windows
src/scene/lineStyle.js   cream outlines (hairline or LineMaterial), flat fills, merging
src/scene/lamps.js       ten street lamps and the progress → light logic
src/scene/marquee.js     marquee face texture, chasing bulbs, clock hand
src/scene/characters.js  Bartholomew and friends as billboard sprites
src/scene/weather.js     sky, moon, stars, fog, rain / snow / leaves
src/scene/celebrate.js   video + day sequences, confetti, fireworks
src/scene/camera.js      presets, follow cam, auto-orbit
src/ui/panel.js          side panel: ledger + environment controls
src/ui/format.js         clock(), words(), dates
```

## Accessibility

- The panel works with the keyboard alone.
- Sliders announce their values.
- A live region reads out the time left after each deduction.
- The canvas carries a text description of the scene.
- With `prefers-reduced-motion`, lamps and characters change state without animating, auto-orbit stays off, and confetti and fireworks become a still glow.
- Without WebGL, the street is replaced by a styled message and the full ledger keeps working.
