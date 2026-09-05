# 🐍 Serpent Isles — Cinematic 3D Snakes & Ladders

A premium, highly-polished **local multiplayer (2–4 humans, pass-and-play) + CPU sailors** 3D Snakes & Ladders game.
Built with **Three.js + Vite + TypeScript**. All 3D assets are **generated procedurally in code** —
no downloads, no external models. 100% offline, installable PWA, zero tracking.

## ✨ Highlights

- **Floating-island arena** — gradient sunset sky, glowing sea, palms, crystals, braziers, fireflies, drifting clouds, stars
- **Jeweled 3D serpents** (10, sculpted hooded heads, jewel eyes, darting tongues) + **golden arched sky-ladders**
- **Championship tokens** — 4 distinct jewelled silhouettes with glow rims + active-player halo
- **Arcane dice ritual** — rounded casino die, charge-up, corkscrew launch, spark trail, slam with slow-mo + shockwave, settling bounces, center-screen result flash
- **🤖 CPU sailors** — hand any seat to the computer; solo play works, mixed crews welcome
- **⚡ Swift voyage** — first past 50 in ~5 min, alongside the classic exact-100 epic
- **⛵ Save/resume** — every turn auto-saves locally; interruptions lose nothing
- **👑 Hall of Fame** — local legends, dice-fairness proof, fortune favorites
- **Party UX** — emoji reactions over tokens, haptics, share-victory, pause menu, pass-the-device toasts, race tracker, match feed
- **Full game feel** — hop-by-hop movement, serpent slides, ladder climbs, tile pulses, auto-director cameras
- **Procedural WebAudio** — rattle, charge, whoosh, thuds, ladder arpeggio, serpent hiss, fanfare + generative music-box ambience (muteable)
- **Cameras** — 📺 auto director by default (top overview at rest, dice close-ups,
  tracking shots for hops/slides/climbs, slow showcase drift when idle, instant
  surrender to drag/scroll) · 🎬 cinematic · 🎯 follow · 🗺️ top-down · 🕹️ free orbit
- **House rules** — exact-finish, bonus roll on 6 (3rd straight 6 forfeits), start-on-6
- **Performance** — merged-geometry board (~6× fewer draws), light rig cut 13→6, shadow stride, occlusion-culled foliage, silent adaptive resolution tiers

## 🚀 Run

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # typecheck + production build
npm run preview  # serve dist on :4173
```

Tip: open `?quickplay` for an instant self-playing demo voyage.

## 🎮 How to play

1. Pick 2–4 seats, name your crew (tap 🤖 for CPU sailors), choose Classic/Swift + house rules → **Set Sail**.
2. Current player hits **ROLL DICE** (or `Space`), pass the device around. `Esc` pauses.
3. Gold rings = ladders up · red rings = serpents down. Classic: exact **100** takes the crown · Swift: first past **50**.
4. **Hover any tile** to spotlight its serpent or ladder while the rest falls quiet;
   the **🐍 button** fades (👻 ghost) or hides all routes for a clean, focused board.

## 🧱 Project layout

```
src/
  main.ts            UI wiring, HUD, CPU drivers, save/resume, HoF, PWA, screens
  style.css          luxe glassmorphism theme, responsive + reduced-motion
  game/
    constants.ts     board math, digital-edition route layout, rules, CPU names
    environment.ts   sky, sea, island, flora, crystals, torches, particles (all procedural)
    board.ts         merged tiles w/ baked numbers, gold frame, rings, crown + goal beacons
    snakes.ts        PBR serpents + sculpted heads, slide curves, tongue AI
    ladders.ts       arched golden ladders (merged), climb curves
    tokens.ts        lathe-turned jewel champions, halos
    dice.ts          rounded casino die + 5-phase arcane throw
    effects.ts       pooled spark bursts + shockwave rings
    merge.ts         bulletproof geometry merging (indexed/non-indexed safe)
    Game.ts          renderer, auto-director, turn engine, snapshots, perf governor
    audio.ts         zero-asset WebAudio synth SFX + generative music
public/
  manifest.webmanifest + sw.js   installable offline shell
```

All 3D assets are procedural — edit the builders above to reskin the world.
