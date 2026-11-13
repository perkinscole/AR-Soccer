# AR Soccer

Tabletop soccer for AR and VR: you look down on the whole pitch like a board game and control one player at a time, arcade-football style. Built with three.js and WebXR, so the same page runs as

- **AR passthrough** on Quest and Android phones (the pitch floats in your room),
- **VR** on any WebXR headset,
- a **flat-screen** view on desktop for development.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. Headsets and phones need HTTPS for WebXR, so to try AR/VR serve the build (`npm run build`, output in `dist/`) from an HTTPS host such as GitHub Pages.

## Controls

| | Keyboard | Gamepad | XR controllers |
|---|---|---|---|
| Move | WASD / arrows | left stick | left stick |
| Sprint | Shift | RB / RT | left trigger |
| Pass (tackle when defending) | Space | A | A |
| Shoot (hold for power) | F | B / X | right trigger |
| Switch player | Q | Y / LB | B |
| Rotate / raise the table | | | right stick |
| Grab and drag the table | | | grip |
| Re-place table / reset view | R | | right stick click |

Movement is always relative to where you are looking from, so "up" on the stick is "away from you" whichever side of the table you stand on. Touch devices get an on-screen stick and buttons.

## Rules

7-a-side, four-minute match. The pitch has boards, so the ball stays in play (no throw-ins or corners). Aim shots at the corners from close range: keepers stop anything central or from distance.

## Layout

- `src/sim.js`: the match simulation (physics, AI, keepers, rules). No rendering, so it runs headless.
- `src/view.js`: pitch, figures, ball and scoreboard.
- `src/input.js`: keyboard, gamepad, touch and XR controller input.
- `src/xr.js`: entering AR/VR and placing the table.
- `src/main.js`: game loop.
- `scripts/smoke.mjs`: `npm run smoke` plays AI-vs-AI matches as a sanity check.
