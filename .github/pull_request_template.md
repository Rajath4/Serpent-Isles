## What changed and why

## How I verified it
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] Played a full match (or `?quickplay` self-play) with no console errors
- [ ] Checked mobile width (≤400px) for HUD regressions

## Checklist
- [ ] No new runtime dependencies without discussion
- [ ] No telemetry, no network calls, files stay on-device (or say so loudly)
- [ ] Docs updated (README / help text) if players see a difference
