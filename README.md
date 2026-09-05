# 🐍 Serpent Isles — Cinematic 3D Snakes & Ladders

A premium, highly-polished **local multiplayer (2–4 players, pass-and-play)** 3D Snakes & Ladders game.
Built with **Three.js + Vite + TypeScript**. All 3D assets are **generated procedurally in code** —
no downloads, no external models.

## ✨ Highlights

- **Floating-island arena** — gradient sunset sky, glowing sea, palms, crystals, braziers, fireflies, drifting clouds, stars
- **Jeweled 3D serpents** (10, with sculpted heads, eyes, flicking tongues) + **golden arched sky-ladders**
- **Championship tokens** — 4 distinct jewelled silhouettes with glow rims + active-player halo
- **Cinematic dice** — velvet pad, tumbling physics-feel roll, squash-on-land
- **Full game feel** — hop-by-hop movement, snake slides along the serpent's body, ladder climbs, tile pulses, camera fly-tos
- **Procedural WebAudio SFX** — dice rattle, hops, ladder arpeggio, serpent hiss, fanfare + ocean ambience (muteable)
- **Premium UX** — setup crew screen, house rules, live HUD, match feed, toasts, win celebration with confetti + stats
- **Cameras** — 🎬 cinematic auto-orbit · 🎯 follow · 🗺️ top-down · 🕹️ free orbit (drag/scroll)
- **House rules** — exact-finish, bonus roll on 6 (3rd straight 6 forfeits), start-on-6

## 🚀 Run

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # typecheck + production build
npm run preview  # serve dist on :4173
```

## 🎮 How to play

1. Pick 2–4 players, name your crew, choose house rules → **Set Sail**.
2. Current player hits **ROLL DICE** (or `Space`), pass the device around.
3. Gold rings = ladders up · red rings = serpents down. First to **100** takes the crown.
4. **Hover any tile** to spotlight its serpent or ladder while the rest falls quiet;
   the **🐍 button** fades (👁 ghost) or hides all routes for a clean, focused board.

## 🧱 Project layout

```
src/
  main.ts            UI wiring, HUD, confetti, setup/win/help screens
  style.css          luxe glassmorphism theme, responsive + reduced-motion
  game/
    constants.ts     board math (1–100 → world), snakes/ladders layout, rules
    environment.ts   sky, sea, island, flora, crystals, torches, particles (all procedural)
    board.ts         tiles w/ baked numbers, gold frame, endpoint rings, crown beacon
    snakes.ts        TubeGeometry serpents + heads/eyes/tongues, slide curves
    ladders.ts       arched golden ladders, climb curves
    tokens.ts        lathe-turned jewel champions, halos
    dice.ts          velvet pad + tumbling die with true face-up orientation
    Game.ts          renderer, cameras, turn engine, cinematic movement tweens
    audio.ts         zero-asset WebAudio synth SFX + ambience
```

All 3D assets are procedural — edit the builders above to reskin the world.
