# Boss possession and combat balance polish

Player-controlled Ascension bosses now use live operative weapon damage, critical chance/multiplier, damage pickups and Supreme pickup-surge bonuses. Each primary attack uses 75% of the current operative fire rate, including Rapid Fire and bombsite fields. Storm Mage charging and Brawler swing presentation shorten with that cadence. Secondary attacks retain their existing cooldowns and use operative damage. Projectiles and melee continue through player weapon damage, kill credit and progression.

Mines, fences, turrets and shield use the operative's existing controls, energy costs, charge racks, active limits and cooldowns while possessing a boss. Boost still triggers the boss secondary attack. Ability shielding protects the chassis through the central damage route, including projectile and hazard hits; ordinary hit invulnerability remains separate. Shield art grows to the chassis radius. Possession still lasts 60 seconds, with its existing separate integrity and restoration lifecycle.

Enemy Arena bosses, including the Supreme finale, shield on combat entrance for 2.5 seconds. The shield has a 35-second cooldown after expiration and can repeat in longer fights. Its clock pauses with combat and its visual/state are retired on cancellation or destruction. Enemy attack damage, attack timing and AI retain their existing tuning. Arcade mini-bosses and the SkyBreach Dreadnought do not receive this Arena encounter shield.

Arena security lasers first appear after 9 seconds (previously 7). Downtime between patterns is 10 seconds at the start, decreasing with rounds to a 6-second floor (previously 7.8 / 3.8 seconds). Telegraph duration, active duration and damage stay unchanged across modes.

SkyBreach maintains two health and two energy pickups throughout flight and the Dreadnought encounter. They use the shared pickup art, collection, attraction and Arena restoration amounts, scroll at the ground layer's 49 units/second, and are replaced after collection or leaving the bottom of the screen. Enemy drops count toward those totals; recovery sectors top up missing supplies. Supply roots are excluded from Arena boundary bouncing, so off-screen retirement works without accumulating render objects or timers.

Overdrive and every Supreme stage use 10% shorter spawn intervals and 12% higher simultaneous standard-enemy count/weight multipliers. Existing per-system ceilings and integer rounding still apply. Normal spawn cadence and caps are unchanged.

## Verification

`npm test`: **879 passed**, zero failures or skips. `npm run build`: TypeScript and production Vite build passed. `git diff --check`: passed. The four browser runs below passed **249 checks** total (78 / 47 / 94 / 30), with no reported errors.

Automated coverage runs the actual encounter logic for all three controlled forms, tests live damage/rate changes, preserves hostile damage/cadence, and checks shield expiry, long cooldown, cancellation and damage ownership. Mode tests cover all Supreme stages and unchanged Normal tuning.

Browser fixtures use isolated DEV profiles and real Arena/SkyBreach entities:

- `audit-infusion-overhaul.browser.js`: existing Infusion controls, all forms, full-minute duration and cleanup.
- `audit-boss-combat-polish.browser.js`: run after the overhaul fixture; checks live operative damage/pickups, all deployable inputs, shield sizing and incoming projectile protection in all three forms.
- `audit-infusion-boss.browser.js`: hostile entrance shield, expiration, player-boss versus enemy-boss damage, victory and loot transition.
- `audit-skybreach-supplies.browser.js`: includes the Arena handoff; verifies restoration amounts, collection replacement, the complete motion/retirement pipeline, 50 seconds of scrolling, bounded enemy/recovery drops, pause and returning-scene behavior.

Local reports use `artifacts/combat-polish-*`. These controlled fixtures validate behavior and lifecycle; extended campaign balance and physical-controller feel still benefit from playtesting.
