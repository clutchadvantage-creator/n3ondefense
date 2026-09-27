# 30/30/30 campaign economy review

Status: **the user approved general reward positions 1–30 / 31–60 / 61–90 and rejected the 148 reward endpoint.** HEIST now uses those reward positions with its existing coefficients unchanged; Supreme HEIST difficulty separately compresses 61–148. The initial alternatives below remain comparison evidence, not active recommendations. See the [subsequent HEIST decision review](heist-campaign-economy-review.md). Source baseline is `e38bcedde97e6487fc8582eabe1cb3f79c7a1f2f`; the worksheet incorporates the independently approved Normal drone introduction.

## Proposed reward positions

Displayed rounds remain 1–30 in each mode. Internal reward positions are inputs to the existing completion, boss-loot, Arcade currency, and Mod rarity curves, not another player-facing campaign round or leaderboard.

| Mode | Rejected 148-endpoint proposal | Approved reward position |
| --- | --- | --- |
| Normal | Local round, 1–30 | Same |
| Overdrive | Local round + 30, 31–60 | Same |
| Supreme | 61 + 3 × (local round − 1), 61–148 | Local round + 60, 61–90 |

Decision: end general rewards at position 90. Do not preserve the old 148 endpoint merely because older formulas used larger round numbers. Current Supreme reward multipliers advance with the specified constellation stages (1.35 at Leo to 2.10 at Centaurus). Below, references to the initial recommended 148 mapping describe the rejected comparison only; the focused HEIST review uses the approved reward axis for its scenarios without treating HEIST balance as approved.

Combat tuning, hazard availability/cadence and site generation remain separate decisions and owners. This is not a universal difficulty multiplier. HEIST's independent difficulty mapping is evaluated below.

## Completion, site and boss rewards

Each mode has 24 ordinary rounds and six bosses. The removed ordinary fifth-round completion bonuses and guaranteed milestone Mods move to successful boss victory, as approved. Successful Supreme completion includes the ordinary round-30 boss and then the additional three-boss finale. The table assumes every physical boss reward is collected, no reward-altering Mods or contracts, and no deaths.

| Mode / mapping | Credits | Core Tokens | Plasma | Finale Flux |
| --- | ---: | ---: | ---: | ---: |
| Normal, 1–30 | 37,200 | 180 | 64 | 0 |
| Overdrive, 31–60 | 68,130 | 514 | 84 | 0 |
| Supreme, 61–148 | 270,043 | 2,256 | 234 | 4 |
| Supreme alternative, 61–90 | 203,103 | 1,593 | 234 | 4 |

These are formula subtotals, not expected total player earnings. They exclude ordinary kills, support enemies, pickups, node Flux, events, HEIST, weeklies, selling/recycling cards, exchanges and one-time Mod packages. Ordinary site recovery assumes the current Normal site-count progression and the mature five-site count in later modes; generated layouts are not simulated. Supreme currency rounding is performed per component, so combining fractional pickups with a completion transaction can differ by a few units.

The recommended Supreme mapping adds 66,940 Credits and 663 Tokens over the 61–90 alternative, about 33% and 42% respectively. Plasma is unchanged because the existing boss curve has already reached its cap. This is a material choice, not a numerical consequence forced by the 30-round design.

## Kills and pickups: sensitivity, not a forecast

The worksheet evaluates 100, 250 and 500 kills per ordinary round. It uses current normalized enemy composition as a proxy for the killed roster and 80% random-pickup collection. Active enemy caps, heavy spawn spacing, player skill, parallel planting and run duration can change actual kills and composition substantially. It includes the approved Normal drone introduction.

At **250 kills per ordinary round** (6,000 over 24 ordinary rounds), fixed rewards plus modeled kill/pickup income are:

| Mode | Credits | Core Tokens |
| --- | ---: | ---: |
| Normal | 82,677 | 475 |
| Overdrive | 117,140 | 896 |
| Supreme, recommended mapping | 352,175 | 2,872 |
| Supreme, alternative mapping | 285,235 | 2,209 |

The pickup table's weights sum to 1.164; Credit/Token shares must be normalized, not interpreted as raw probabilities. Kill income includes the existing direct Star Token separately from random Token pickups. There is no assumed ordinary-kill Plasma income; card recycling is a player choice, not additional guaranteed currency.

## Flux and anomaly access

Node drops retain the existing 42% chance. At 80% collection, destroying 2 / 6 / 12 nodes per ordinary round produces an expected **16.13 / 48.38 / 96.77 raw Flux** over a mode's 24 ordinary rounds, before Supreme banking multipliers or optional sources. These are assumed total node destructions over an encounter, not simultaneous node capacities. Real node-kill counts are not known.

Entry remains 35–90 Flux inclusive. Consequently, access frequency depends strongly on node harvesting, Arcade results, weeklies and the player's choice to spend Flux on entry or exchange. A blanket campaign-level number of HEIST entries cannot be honestly inferred from round count alone.

## HEIST mapping and reward impact

Recommendation: use the proposed reward position for HEIST reward formulas and a separate HEIST difficulty input with the same proposed mapping initially. Retain all existing coefficients, elite behavior and concurrent-enemy caps. Do not apply the Arena Supreme currency multiplier to HEIST containers; the existing extraction path does not do so.

At a 60-Flux fee, assuming successful extraction and all 5–8 containers opened with equal probability (mean 6.5), the current formula expectations are:

| Position | Example | Credits | Tokens | Plasma | Flux |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Reference only; anomalies are not available on first round | 180,750 | 36.80 | 106.71 | 7.42 |
| 30 | Normal end | 238,750 | 43.90 | 121.50 | 8.29 |
| 31 | Overdrive entry | 240,750 | 44.15 | 122.01 | 8.32 |
| 60 | Overdrive end | 298,750 | 51.26 | 136.80 | 9.19 |
| 61 | Supreme entry | 300,750 | 51.50 | 137.31 | 9.22 |
| 90 | Alternative Supreme end | 358,750 | 58.61 | 152.10 | 10.09 |
| 148 | Recommended Supreme end | 474,750 | 72.82 | 181.68 | 11.83 |

Each extraction also averages 1.5 container Mods. Means are before integer rounding; no universal fallback is assumed because valid Mod pools exist. A brief 512-seed source sample per position is retained separately in the JSON; those sampled means are not substituted for analytic expectations.

Other HEIST income remains separate: its 40%-chance mini-boss awards mean Plasma `35 + 0.28r` when present, and eligible enemy bonus opportunities retain their 7.5% trigger chance. Conditional bonus means include Credits `0.70 × (975 + 85r)`, Plasma `0.20 × (2 + 0.035r)`, Tokens `0.07`, Flux `0.025` and a Mod with probability `0.005`; multiply those by the trigger chance and actual eligible kills. Normal enemy pickups are additional. No kill or extraction-success count is assumed.

Difficulty consequences, retaining the existing formulas:

| Position | Initial regular-enemy target | Escape target before existing enemies/cap | Container HP |
| --- | ---: | ---: | ---: |
| 30 | 10 | 14 | 120.0 |
| 60 | 13 | 18 | 186.0 |
| 61 | 13 | 18 | 188.2 |
| 90 | 16 | 22 | 252.0 |
| 148 | 16 | 29 | 379.6 |

The escape target of 29 is not 29 simultaneously active enemies: the existing 24-enemy allowance includes enemies already alive and the mini-boss. Existing spawn/weight gates remain authoritative. HP/damage still use the shared combat curves and active mode/stage; no new multiplier is proposed here. Portal charging's existing `min(26, ceil(12 + 0.28r))` reaches its cap by position 47, so later-mode portals would retain the mature charge requirement instead of restarting at the early requirement.

HEIST remains valuable: a Normal-end successful extraction can fund all current permanent upgrades. This is existing reward behavior. However, 60 Flux could instead be exchanged for **1,800,000 Credits**, so HEIST is not the highest Credit return on that Flux. Preserving this existing relationship versus rebalancing it requires explicit direction; no exchange or HEIST coefficient has been changed.

## Arcade and weeklies

All six event owners were checked, including the profiles that override registry defaults. The JSON contains expected rewards per successful event at positions 1, 30, 60, 90 and 148. It includes Hot Package's 68%/25%/7% quality distribution, Packet Snatcher's guaranteed card and 22% seed-dependent bonus, and every Redline reward rank. These figures are before physical collection and Arena currency banking.

At position 30, expected Credit / Token / Plasma / Flux rewards per success are:

| Event | Credits | Tokens | Plasma | Flux | Mods |
| --- | ---: | ---: | ---: | ---: | ---: |
| Golden Hunt | 476 | 0.72 | 2.00 | 0.16 | 0.18 |
| Arcade mini-boss | 686 | 1.08 | 3.00 | 0.48 | 0.18 |
| Neon Circuit | 392 | 0.72 | 1.80 | 0.16 | 0.18 |
| Hot Package, quality-weighted | 523.10 | 0.82 | 2.31 | 0.32 | 0.25 |
| Packet Snatcher | 316.20 | 0.20 | 2.24 | 0.08 | 1.42 |
| Redline, rank D | 155.84 | 0.28 | 0.64 | 0.13 | 0.13 |
| Redline, rank S | 1,440 | 2.24 | 7.04 | 1.04 | 0.52 |

Event incidence cannot be determined from 30 rounds: scheduling uses active time, mode-dependent opportunity chance, cooldowns, tutorial availability and competing encounters. Boss-only rounds also remove six ordinary event windows per mode. No compensating frequency increase is proposed.

Regular weekly packages currently grant 750–1,500 Credits, 1–2 Tokens and up to 1 Flux. Overdrive packages grant 35,000–60,000 Credits, 8–12 Tokens, 12–20 Plasma and 2 Flux, with a random Mod in three rotations. They remain rotation-based, not one reward per campaign. The impossible Overdrive round-40 objective must change separately; its reward amount is not changed by this worksheet. Supreme acquisition gating must also apply to the weekly random-card path.

## Costs and build viability

| Existing sink | Cost |
| --- | --- |
| Every permanent upgrade level | 99,766 Credits total |
| Rank any one card from 0 to 3 | 3,800 Credits plus rarity-dependent Tokens |
| Rank Common / Uncommon / Rare | 0 / 0 / 17 Tokens total |
| Rank Epic / Legendary / Supreme | 145 / 850 / 2,050 Tokens total |
| Recalibration / reset | 125 / 75 Plasma; rank 3 required |
| Infusion installation | 300–425 Plasma |
| Infusion reconfiguration / removal | 90 / 60 Plasma |
| Focus signal | 12,500 Credits per deployment |
| Additional saved configurations | 25,000 / 75,000 / 200,000 / 500,000 Credits |
| Contracts | 20,000 / 30,000 / 25,000 Credits per deployment |

Normal's 37,200-Credit fixed subtotal supports multiple permanent upgrades and ranking its three Common training cards (11,400 Credits, no Tokens). The Normal completion package's two Epics plus Legendary costs 1,140 Tokens to max; immediate max-ranking of the entire package is not supported by fixed Normal earnings alone, and is not assumed necessary for progression.

Across Normal and Overdrive, fixed rewards sum to 105,330 Credits, 694 Tokens and 148 Plasma. A player can allocate those toward permanent upgrades, several lower-rarity ranks and a recalibration, but cannot fund every listed sink simultaneously. Recalibration also requires a max-ranked eligible card. Optional kills, events and exchanges can expand those choices. Supreme's two guaranteed cards cost 4,100 Tokens together to max, keeping full top-tier ranking a longer-term choice rather than an automatic completion reward.

Contracts currently need approximately 400,000 / 300,000 / 312,500 eligible gross Credits respectively to recover their purchase price through the Credit multiplier alone. Their Mod/drop effects have additional value. Direct HEIST banking and boss loot do not automatically receive the ordinary-completion contract multiplier. Existing contract description discrepancies are outside this pass; this report uses the actual multipliers.

Exchange rates remain unchanged. Examples: 200 Credits → 1 Token; 100 Credits → 1 Plasma; 60,000 Credits → 1 Flux; 1 Flux → 30,000 Credits **or** 250 Tokens **or** 350 Plasma. One Flux is one allocation, not all three rewards. These exchange options substantially change affordability and explain why raw Token/Plasma totals alone cannot measure build access.

## Mod rarity review

The JSON evaluates actual definition-weighted pools and source-specific drop chances; rarity base weights alone are not probabilities. Six guaranteed milestone cards per mode remain, plus the approved one-time packages. Existing source distinctions, focus weights and contract effects are preserved for the later integration review.

At the last boss of each mode, using current weights and the recommended positions:

| Mode | Chance of boss card | Rare if a card drops | Epic | Legendary | Supreme |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal | 62.0% | 44.03% | 24.42% | 2.46% | 0% |
| Overdrive | 83.7% | 48.71% | 27.01% | 4.26% | 0% |
| Supreme | 100% | 40.43% | 22.42% | 4.38% | 26.42% |

These are the existing curves evaluated at proposed positions, not a claim that all rarity targets are finalized. Supreme's added rarity consumes some of the conditional Rare/Epic share. Its higher card frequency, guaranteed milestone pool and full per-mode totals must be considered when validating the requested improvement in opportunities. Top-tier cards remain excluded from Normal/Overdrive; the explicit Overdrive-completion package is delivered after Supreme unlock.

## Reproduction and limits

Run `node --experimental-strip-types scripts/analyze-campaign-economy.ts docs/campaign-economy-review.json`.

The [machine-readable worksheet](campaign-economy-review.json) includes source/sink values, both mapping alternatives, kill and Flux sensitivities, event rewards, rarity probabilities, analytic HEIST expectations and brief seeded container samples. Arcade worksheet profiles are transcribed from their current owners to avoid importing Phaser rendering into Node; changes to those profiles require updating the worksheet inputs. No long browser test, account-save access, production telemetry or campaign clear was performed for this calculation.

The general reward-position decision is resolved as 1–90. Required remaining review: HEIST coefficients and mapping, using the subsequent focused analysis. No HEIST numerical changes are installed pending that answer.
