# Brawler mace update

The Phase Mauler now carries a large eight-spike mace on a retractable chain, with longer articulated weapon and shield arms. A reusable Phaser graphics layer draws the arms, chain links, metal head, neon trim and short swing trail alongside the existing chassis, legs and shield art.

- Three complete primary swings automatically start an extension cycle.
- The chain extends over 280 ms, holds for 850 ms, then retracts over 350 ms. Three more swings start the next cycle.
- Enemy swings take 1.1 seconds per revolution; controlled swings take 0.8 seconds. Weapon damage pulses retain the operative's existing 75% fire-rate scaling and live damage calculation.
- Releasing primary retracts the chain and returns the head to a forward resting pose. Extension needs no new input.
- Shared motion geometry drives the rendered head and damage location. Controlled damage sweeps the sampled head path, testing each enemy once per pulse. It also damages hostile bosses through the existing weapon damage route.
- Enemy body contact, charge input/timing/speed, teleport and ambush remain in their existing encounter paths. The chassis collider stays at a 34-pixel radius.
- Possession still uses the existing minute-long duration, operative deployables and shield. The renderer belongs to the boss container and is destroyed with it.

Tuning and shared geometry are in `src/game/bosses/BrawlerMaceMotion.ts`; rendering is in `BrawlerMaceRig.ts`.

## Verification

- `npm test`: 932 passed, including cycle timing, frame-rate independence, resting/retraction behavior, head geometry, swept hits, live operative damage/cadence and preserved charge behavior.
- `npm run build`: passed.
- `scripts/audit-brawler-mace.browser.js`: 22 checks passed in an isolated browser using real Arena input, callbacks and entities. Checked enemy/controlled extension, real enemy and hostile-boss damage, charge, deployables, shield, possession exit and scene cleanup. Reviewed captures at the existing 0.9 gameplay zoom.
- Existing infusion and boss combat browser fixtures passed (78 infusion checks plus all three chassis' combat/deployable checks). The combat fixture now places brawler targets at the actual mace head instead of the removed hammer impact point.

Browser checks use controlled placement and paused physics for deterministic hit assertions; they are not a full campaign playthrough. Local reports and screenshots are under ignored `artifacts/brawler-*` and `artifacts/mace-*` paths.
