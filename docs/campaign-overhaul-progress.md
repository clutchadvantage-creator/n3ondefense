# 30/30/30 campaign implementation status

Baseline: clean `main` at `e38bcedde97e6487fc8582eabe1cb3f79c7a1f2f` before this work. The overhaul is in progress. This document is not a completion report.

## Approved decisions

- Preserve legitimately earned legacy mode/checkpoint access without demanding boss records that older saves never stored. New progression requires boss victory.
- Grant qualifying migrated players the new one-time packages. Eligibility and claims are separate; ownership is not proof of a previous claim.
- Introduce ordinary Normal drones at round 11 with low initial frequency/cap and gradual later pressure. Preserve event drones.
- Move removed fifth-round completion bonuses and guaranteed milestone Mods onto successful boss victory, in addition to boss loot.
- Use separate versioned Normal, Overdrive and Supreme online leaderboards; retain legacy rankings separately. No combined 1–90 leaderboard or speed leaderboard.
- General reward positions are **1–30 / 31–60 / 61–90**, independently of difficulty. The proposed 148 reward endpoint was rejected. HEIST coefficients/mapping are paused pending the separate review.

## Connected gameplay change

Ordinary Normal drone availability now starts at round 11: raw composition weight grows from 0.015 to 0.045 through round 30, with one concurrent drone through round 20 and two thereafter. Total count/weight budgets, other modes' drone rules and Redline remain unchanged. The existing drone/Redline suite passes with the updated availability requirement.

## Prepared foundation

`CampaignProgression.ts` defines local rounds 1–30, six boss positions, arbitrary earned starts, per-mode completion, the requested Supreme stage mapping, victory destinations and separate reward eligibility/claim fields. It leaves scene/loot ownership with Arena. Supreme 30 boss victory unlocks its replay position but campaign completion requires the subsequent Trinity victory. A routing function does not itself verify three physical boss deaths; that remains required in the Arena integration.

`CampaignLegacyMigration.ts` prepares an archived legacy record and new campaign state without changing inventory, currencies or the input record. It freezes the old unlock thresholds so future live-table changes cannot reinterpret legacy access. Old Normal starts are preserved within the new 30-round range, with higher starts mapped to 30. Old regular Overdrive starts up to 30 remain available, and higher earned starts map to 30. Supreme access maps by constellation identity and its old unlock thresholds. Existing finale completion remains complete even where its highest recorded round is 100 rather than the Centaurus unlock threshold 148. Grandfathered access does not manufacture verified new boss victories. Old completed Normal 30+ and explicit Overdrive/finale completion qualify for the corresponding packages; old Overdrive access alone does not count as a Normal clear.

`CampaignRewardPackages.ts` prepares cards and claim flags together on a draft copy for a later single save commit. It uses existing inventory duplicate handling, selects unowned cards first, avoids repeated definitions within a package when possible, and checks Supreme access before the Overdrive completion package. Presentation must occur after persistence through the existing Mod reveal system. The helper itself neither saves nor shows reveals.

**These campaign modules are not yet connected to the live save, menu, reward or Arena paths.** Save version remains 18. No player profile has been migrated or granted rewards. The current running game retains the old campaign until the coordinated integration is complete. The Normal drone availability change above is connected independently.

## Validation so far

The three new focused suites contain 22 passing tests covering reward positions, local-round routing, rejected encounter mismatches, boss-earned starts, mode gates, Supreme stage boundaries, final-boss/finale ordering decisions, legacy access examples, reward eligibility versus claims, and empty/partial/nearly complete/complete card collections. The six existing drone/Redline checks also pass: **28 tests total**. `npx.cmd tsc --noEmit` passed. JSON round trips exercise the draft claim data, not actual localStorage durability. These are foundation tests, not browser, lifecycle, persistence or performance validation.

## Pending integration

1. Wire the campaign model into operations selection and saved state together with boss-only round construction; avoid activating local numbering while combat/reward consumers still assume old rounds.
2. Update Arena completion, defeat, reward collection and Supreme boss → Trinity lifecycle. Preserve authoritative successful-completion and retirement owners.
3. Connect one-time packages to one persisted transaction and the existing Mod reveals. Implement combat → Garage/Collection → Store tutorial groups without replay farming.
4. Apply independently reviewed difficulty/hazard mappings, Normal drone introduction, all reward-source Supreme gating, and incompatible weekly objective updates.
5. Complete versioned save normalization/migration, preserve preferences and archived records, and validate actual save reloads and claims.
6. Implement approved separate mode leaderboard/schema versioning and boss-compatible verification while preserving legacy data.
7. Update inaccurate UI/LYRA references and run focused functional regression, followed by appropriate existing lifecycle/performance checks.

The [original economy comparison](campaign-economy-review.md) retains both reward endpoints as evidence; general progression is now approved as 1–90. The [focused HEIST review](heist-campaign-economy-review.md) covers collection requirements, Flux affordability, exchanges and two unimplemented Credit-only alternatives. No HEIST coefficients, exchange rates, upgrade prices or event scheduling have changed.
