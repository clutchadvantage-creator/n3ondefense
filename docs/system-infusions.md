# Mod-linked System Infusions

System Infusions are installed on individual Mod cards through the existing Mod Collection Infusion terminal. They share the existing single infusion field with cosmetic infusions: installing either replaces the previous infusion on that card.

Only the five normal equipped slots activate systems. Owned but unequipped cards are inactive, and duplicate systems do not stack. Installation/equipment rejects duplicates within a loadout; runtime deduplication also handles older or malformed saves. Additional snapshot slots cannot produce a sixth active system.

The existing save normalizer recognizes the new registry IDs. Card identity, rank, recalibrations and normal Mod effects remain intact. Re-equipping a card restores its installed system. System-infused cards are protected from bulk duplicate recycling.

## Controls and starting tuning

Aim with the normal cursor/reticle and use the dedicated **Infusion** control: **C** on keyboard or **right-stick click (RS / R3)** on controller. **E / A / Cross** remains Plant / Interact, even with an Infusion target selected. A contextual prompt identifies the action. Shooting remains independent. When two actions share a turret or mine, tap activates the first and an 800 ms hold activates the second; releasing after a successful hold does not also trigger the tap action.

| System | Interaction and behavior |
| --- | --- |
| Relay Jump | Tap Infusion on a living player turret. Safe landing beside it, arena-wide range, 5 s cooldown. |
| Gridlink | Automatically joins nearby living fence endpoints within 540 units. Generated links use normal fence damage and slowing; maximum 16 links. |
| Target Designator | Tap Infusion on an enemy or boss. Turrets prioritize it for 4 s while respecting range and clear geometry; 8 s cooldown. |
| Ascension Protocol | Hold Infusion on a turret to consume three living turrets. Pilot a random existing boss chassis for 60 s (or until its integrity runs out); 45 s cooldown. It is never in the enemy completion roster. |
| Detonator Link | Tap Infusion on a landed player mine. Uses the original mine explosion, damage, audio and cleanup. |
| Cascade | Explosions queue neighboring mines within 350 units, one every 140 ms. Chains propagate outward with visited tracking and a 24-mine propagation cap. |
| Magnetic Redeploy | Select a landed mine, then press Infusion at a valid destination within 500 units of it. Hold to select when Detonator Link is also equipped. Preserves the mine instance; 4 s per-mine cooldown, 8 s selection timeout. |
| Power Bus | While Boost is active, energizes up to four nearby devices within 450 units. Each draws an additional 6 Energy/s. Turrets fire faster, fences gain extra pulses, and landed mines arm immediately. Stops when Boost stops or Energy is insufficient. |
| Hazard Hijack | Press Infusion on the marked relay in an existing security laser beam. The laser network becomes safe for the player for 5 s while retaining enemy damage; 15 s cooldown. |
| Fence Rail | Select a nearby fence endpoint and press Infusion once. Automatic, invulnerable travel follows the connected segments; 4 s cooldown. A normal fence works by itself, and Gridlink expands the reachable network. |

Hazard Hijack currently supports **arena security lasers**. Gas and fire retain their existing rules. Suppressed lasers and boss encounters cannot be activated through this interaction. Expiry and round cleanup restore normal laser ownership without altering the hazard schedule.

Ascension weapons use the operative's current damage, critical stats and active damage bonuses. Primary attacks run at 75% of the current operative fire rate, including Rapid Fire and field bonuses. Mines, fences, turrets and shield keep their normal controls, energy costs and cooldowns; Boost triggers the chassis secondary attack. Shield protects the active chassis and scales to its size. See [combat polish](combat-balance-polish.md) for balance changes and validation.

New installations cost 180 Plasma Chips. Existing reconfiguration/removal costs remain 90/60. The terminal confirms the exact transaction cost before charging.

## Runtime and validation

Definitions, descriptions, requirements, hooks and tuning live in `src/game/mods/SystemInfusions.ts`. `ModRuntime` resolves equipped card state; `SystemInfusionRuntime` owns contextual interaction, network topology, selections and cooldowns. `ArenaScene` supplies existing actor, collision, damage and presentation systems.

Fence topology rebuilds when the deployable registry changes. Context and Power Bus scans run at 100 ms intervals; targeting uses the existing enemy spatial grid. Links, powered devices and mine chains are bounded. Round completion, defeat, encounter transitions and shutdown use the existing cleanup owner.

Initial release validation (see [the overhaul report](system-infusion-overhaul.md) for current behavior and follow-up checks):

- 840 automated tests passed, including 22 focused System Infusion tests; production TypeScript/Vite build passed.
- Live browser checks exercised both five-system builds using real turrets, fences, enemies and mines. Checks included Gridlink damage, safe Relay/Fence Rail travel, targeting invalidation, Power Bus drain, same-instance mine relocation and sequential mine explosions.
- Live laser checks verified player protection, continued enemy damage, expiry and suppression. Live round completion removed the allied tank and all Infusion state.
- The actual Infusion terminal was visually checked at 1280×720, including longer names and descriptions.
