# Arena and anomaly pickup consistency

Arena remains the reference for non-Mod pickup presentation. HEIST now uses the same floating drift, separation, physical-loot launch, magnetic attraction, energy collection eligibility, collection labels and sound keys. The HEIST-only loot-spawn sound, smashable pop-scale and shrinking collection flight were removed. Container impact/break sounds remain.

`GameplayPickupMotion.ts` contains the extracted Arena movement and collection rules. `GameplayPickupPresentation.ts` owns artwork, collection sounds/labels and the physical-loot launch. Future anomaly scenes should use both helpers, supply their own bounds and blocked geometry, and retain authority over reward accounting and scene cleanup. HEIST supplies its walls and closed vault doors. Neither helper introduces a new encounter owner.

HEIST reward coefficients, entry fee, drop rewards, support restoration amounts, container requirements, provisional loot and extraction rules remain unchanged. Currency overflow still merges into bounded reusable stacks without losing value. Mod pickup/reveal presentation remains independent.

Four focused unit tests cover collection thresholds, attraction, wall/bounds separation and landing selection. The short browser fixture verifies Arena/HEIST eligibility and sound dispatch, magnetic pull, launch and drift, currency overflow, exact provisional collection, pool reuse, failed-extraction discard and scene retirement. It uses an isolated profile, supplied energy, invulnerability and a test-only disabled HEIST pointer bridge so headless input cannot pause pickup simulation. Sound keys were checked; physical audio output was not reviewed. This is not a campaign soak.

The final browser run passed **19 checks with no errors**. The production build and all **784 unit tests passed**. The local browser record is `artifacts/pickup-parity-browser.json`.

Run sequentially in an isolated DEV WebGL browser on debugging port 9225 with Vite on 5173:

```powershell
node scripts/run-layout-audit.mjs artifacts/pickup-parity-browser.json ./audit-pickup-parity.browser.js
```
