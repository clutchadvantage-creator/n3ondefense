# HEIST economy decision review

Decision: **retain the existing HEIST coefficients**. Rewards use Normal 1–30, Overdrive 31–60 and Supreme 61–90. Difficulty uses Normal 1–30, Overdrive 31–60 and the separately approved smooth Supreme mapping `61 + 3 × (local round − 1)`, ending at 148. Existing caps stay intact. Alternatives A and B below are historical review options and were not implemented. The 35–90 Flux fee, exchange rates, upgrade/Mod prices and HEIST coefficients remain unchanged.

## What an actual successful HEIST requires

`HeistScene.damageContainer` only opens the exit sequence after **all generated containers are opened**. There are 5–8 containers; this is the normal mission requirement, not an optional maximum-loot route. The 45-second escape clock starts on leaving the vault, after opening all containers. Loose rewards must still be collected, and only successful extraction commits them. There is no legitimate successful 1–4-container route to use as a lower-payout baseline.

The code does not establish typical node harvesting, pickup collection or extraction success rates. Existing assisted fixtures cannot establish them either. The following scenarios expose those assumptions instead of claiming observed average-player behavior.

## 1–2. Available Flux and entry frequency

Node drop probability is 42%. With **80% collection** and 24 ordinary encounters per mode, these are expected banked amounts from nodes alone. Supreme uses its progressing 1.35–2.10 banking multiplier and per-encounter integer rounding.

| Nodes destroyed per ordinary encounter | Normal Flux | Overdrive Flux | Supreme Flux |
| --- | ---: | ---: | ---: |
| 2, limited harvesting | 16.13 | 16.13 | 28.33 |
| 6, middle scenario | 48.38 | 48.38 | 82.41 |
| 12, focused harvesting | 96.77 | 96.77 | 163.21 |

These are total destructions over each encounter, not simultaneous capacities. Under the middle scenario, starting with no Flux, the 35 / average 62.5 / 90 fees require approximately **18 / 32 / 45 ordinary encounters** in Normal or Overdrive. Supreme's mode-average rate gives **11 / 19 / 27**. These divide a fee by mean income; they are not exact stochastic first-affordability times, and Supreme's early-stage income is below its whole-mode average.

Thus a middle-scenario player could afford a low-priced HEIST late in Normal, but not every randomly priced portal. Across Normal and Overdrive, about 96.8 node Flux supports roughly one average-fee entry, with currency left over; Supreme adds about another average-fee entry. A focused harvester could afford more, while a player who rarely attacks nodes might not afford one before later modes. Replays and starting wallet change this substantially.

Other sources: regular weekly rewards add 0–1 Flux per qualifying rotation; Overdrive weeklies add 2. Arcade returns depend on event/rank/position: at position 30, expectations span roughly 0.08–1.04 Flux per success before banking; at position 90, roughly 0.16–1.56. Events occur on timers with mode-dependent chances, so no fixed number per campaign is assumed. Successful HEIST can return some Flux; Supreme's final encounter adds 4. Credits→Flux costs 60,000 per Core and is unlikely to be the main early funding source. Failure spends the entry fee without banking the provisional haul. Portal availability is an additional constraint beyond affordability.

## 3–4. Successful extraction payouts

For a 60-Flux entry, equal occurrence of 5–8 generated containers (mean 6.5), and **80% of each reward category collected**, the existing formulas produce:

| HEIST reward position, illustrative | Credits | Plasma | Tokens | Flux | Mod cards |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10, early Normal example | 159,000 | 89.04 | 31.20 | 6.15 | 1.20 |
| 30, Normal end | 191,000 | 97.20 | 35.12 | 6.63 | 1.20 |
| 60, Overdrive end | 239,000 | 109.44 | 41.01 | 7.35 | 1.20 |
| 90, Supreme end candidate | 287,000 | 121.68 | 46.89 | 8.07 | 1.20 |

This is a collection scenario, **not a measured typical player**. Full collection gives 198,750 / 238,750 / 298,750 / 358,750 Credits at those positions. At 50% collection it gives 99,375 / 119,375 / 149,375 / 179,375. Opening only the minimum generated five containers yields mean full-collection Credits `155,500 + 1,700r` at fee 60, still 172,500 at position 10. The four guaranteed containers provide Credits, Plasma, Tokens and a Mod; random remaining containers add to that floor.

Entry-price effects are modest compared with the large Credit base: changing the fee from 60 to 35/90 changes mean full-collection Credits by −15,625/+18,750. The fee is not refunded on extraction; returned Flux is loot. A middle-scenario success returns roughly 6–8 of the 60 spent, leaving a large net Flux cost.

Mini-boss and eligible enemy drops add value separately. The optional mini-boss has a 40% spawn chance and mean Plasma `35 + 0.28r` when killed; enemy bonus opportunities trigger at 7.5%. Their kill counts are not assumed above. Mods use the existing anomaly rarity pool and normal inventory behavior. They are build items, not a single reliable Credit valuation: recycling yields 1/2/3/5/8/20 Plasma by rarity, while selling yields 100/180/320/550/900/2,400 Credits and consumes the card. The guaranteed Mod is only banked if collected and extracted.

## 5. Comparison with other rewards

With approved 1–90 reward positions, modeled completion/site/boss/finale subtotals per entire mode are **37,200 / 68,130 / 203,103 Credits**, excluding kills and optional sources. At an illustrative 250 kills per ordinary encounter, those become approximately **82,677 / 117,140 / 285,235**. These are scenario calculations, not expected campaign earnings.

At Normal 30, completion + boss loot gives 4,040 Credits, 18 Tokens and 14 Plasma before support loot. Ordinary completion at that position gives 1,140 Credits plus site and kill rewards. Position-30 Arcade success yields about 155.84–1,440 expected Credits depending on event/rank, with small currency amounts and distinct Mod rewards. Overdrive weeklies give 35,000–60,000 Credits per qualifying rotation. A successful HEIST is therefore a major optional payout, often worth more Credits than an entire ordinary-mode campaign's baseline rewards.

## 6–7. Exchange and permanent-upgrade impact

**Yes: one reasonably collected early HEIST can fund every current permanent upgrade** (99,766 Credits total), provided the player can afford entry and extract. Even 50% collection at position 10 nearly covers that amount, before any pre-existing wallet or combat income.

However, the existing exchange already permits the same outcome with **4 Flux → 120,000 Credits**, far below the minimum 35-Flux entry fee. This is a live, directed exchange in the Store with no campaign-round requirement; the tutorial intends to teach it. For a player prioritizing upgrades, converting a few Flux is a practical dominant Credit choice, not merely a theoretical value. A whole 60-Flux conversion may be unnecessary for upgrades, but its 1.8M Credits can also fund saved configurations or be converted into Tokens/Plasma at existing rates. Players may nevertheless choose HEIST for its content, direct Mods, currencies and preference to avoid exchange.

Consequently, **lowering HEIST Credits alone cannot enforce gradual permanent-upgrade acquisition while those exchange rates remain fixed**. This report does not propose changing exchange rates or upgrade prices.

## 8. Choices, without implementation

| Credit-only choice | N10 at 80% collection | N30 at 80% | OD30 at 80% | S30 at 80% |
| --- | ---: | ---: | ---: | ---: |
| Existing coefficients | 159,000 | 191,000 | 239,000 | 287,000 |
| Alternative A: 50% of all HEIST Credit coefficients | 79,500 | 95,500 | 119,500 | 143,500 |
| Alternative B: 25% of all HEIST Credit coefficients | 39,750 | 47,750 | 59,750 | 71,750 |

These alternatives change only Credit amounts; fees, Plasma, Tokens, Flux, Mods and mechanics stay fixed. For A/B respectively, the guaranteed Credit base would be 50,000/25,000 instead of 100,000, its per-entry-Flux term 250/125 instead of 500, and its per-position term 750/375 instead of 1,500. Regular container Credits, variance, fallback Credits and enemy-bonus Credit coefficients would scale consistently. This is a material payout reduction despite its narrow scope, and neither option is approved or implemented.

I recommend **not reducing HEIST solely to solve early upgrade affordability**, because exchange already determines that outcome. If the separate goal is making HEIST less dominant versus ordinary combat income, Alternative A is the smaller reduction; it still often funds most or all upgrades in one successful run. Alternative B reduces that direct payout further but makes the Credit return on entry Flux even less competitive with exchange. Neither option restores a slow upgrade economy under current exchange rules.

Evidence: [reproducible worksheet](campaign-economy-review.json), [analysis script](../scripts/analyze-campaign-economy.ts), `HeistScene.ts`, `HeistRewardService.ts`, `HeistConfig.ts`, `CurrencyExchange.ts`. Both mappings and retaining the existing coefficients were subsequently approved explicitly. The analysis remains scenario-based, not measured typical player income.
