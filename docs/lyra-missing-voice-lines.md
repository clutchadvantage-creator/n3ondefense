# LYRA — remaining custom voice recordings

The current English catalog contains **62 message IDs: 17 have working custom recordings and 45 have no matching custom recording**. The following is generated from the actual message registry, tutorial text resolver, recording map, and files in `public/assets/audio/lyra/`.

Missing recordings use local browser TTS when LYRA voice and Browser TTS are enabled and a suitable local voice exists. Otherwise they use the existing text-only fallback. This is a coverage inventory, not a claim that every message played during a test session.

## Recording list — every message without custom VO

Record the quoted text for each ID. Suggested filenames are organizational suggestions; new files must also be registered in `LYRA_RECORDINGS` before the game uses them. Keep files in `public/assets/audio/lyra/`.

### 1. warning.health

ID: `warning.health`  
Suggested file: `lyra-warning-health.mp3`

> Integrity critical. Move clear and recover health.

### 2. warning.defuse

ID: `warning.defuse`  
Suggested file: `lyra-warning-defuse.mp3`

> Charge under disarm. Interrupt the defusers now.

### 3. tactical.planted

ID: `tactical.planted`  
Suggested file: `lyra-tactical-planted.mp3`

> Charge armed. Hold this site and keep the defusers off it.

### 4. event.arcade.complete

ID: `event.arcade.complete`  
Suggested file: `lyra-event-arcade-complete.mp3`

> Arcade objective complete. Rewards secured.

### 5. event.arcade.failed

ID: `event.arcade.failed`  
Suggested file: `lyra-event-arcade-failed.mp3`

> Arcade window closed. Return to the primary objective.

### 6. context.pickup

ID: `context.pickup`  
Suggested file: `lyra-context-pickup.mp3`

> Recovered supplies restore combat resources. Collect them when the approach is clear.

### 7. context.anomaly

ID: `context.anomaly`  
Suggested file: `lyra-context-anomaly.mp3`

> Anomaly access detected. Check the entry fee and extraction objective before committing.

### 8. context.arcade

ID: `context.arcade`  
Suggested file: `lyra-context-arcade.mp3`

> Arcade objective online. The notification console tracks your target and remaining time.

### 9. context.hazard

ID: `context.hazard`  
Suggested file: `lyra-context-hazard.mp3`

> Security hazards are active. Watch their warning zones and move before they fire.

### 10. context.recalibration

ID: `context.recalibration`  
Suggested file: `lyra-context-recalibration.mp3`

> Recalibration rolls a replacement stat. Review the cost, then compare the candidate before applying it.

### 11. context.infusion

ID: `context.infusion`  
Suggested file: `lyra-context-infusion.mp3`

> Infusion changes this card’s visual finish. Review the appearance and resource cost before committing.

### 12. context.supreme

ID: `context.supreme`  
Suggested file: `lyra-context-supreme.mp3`

> Supreme protocols are available. Inspect the requirements in Operations before deploying.

### 13. system.ready

ID: `system.ready`  
Suggested file: `lyra-system-ready.mp3`

> Systems linked. I am LYRA. Let’s keep your next deployment productive.

### 14. ambient.garage.1

ID: `ambient.garage.1`  
Suggested file: `lyra-ambient-garage-1.mp3`

> A balanced loadout. A reassuring amount of engineering has gone into your survival.

### 15. ambient.garage.2

ID: `ambient.garage.2`  
Suggested file: `lyra-ambient-garage-2.mp3`

> Take your time. The arena has never complained about receiving a prepared operative.

### 16. ambient.store.1

ID: `ambient.store.1`  
Suggested file: `lyra-ambient-store-1.mp3`

> Permanent upgrades. My preferred form of optimism.

### 17. READ THE FIELD

ID: `tutorial.onboarding.tactics.awareness`  
Suggested file: `lyra-tutorial-onboarding-tactics-awareness.mp3`

> Systems checked. Watch each module?s readiness and the security warning zones. Keep your escape route open while defending.

### 18. STORE / UPGRADES

ID: `tutorial.onboarding.menu-store.store`  
Suggested file: `lyra-tutorial-onboarding-menu-store-store.mp3`

> Credits earned in the Arena persist between runs. Spend them on permanent upgrades that help your operative push farther. Click STORE to continue.

### 19. CREDITS PERSIST

ID: `tutorial.onboarding.store.credits`  
Suggested file: `lyra-tutorial-onboarding-store-credits.mp3`

> Credits earned during deployments remain in your wallet and fund permanent improvements.

### 20. CHOOSE A SYSTEM

ID: `tutorial.onboarding.store.card`  
Suggested file: `lyra-tutorial-onboarding-store-card.mp3`

> Each upgrade module shows its current level, next improvement, and cost. Upgrades apply to future deployments.

### 21. RETURN STRONGER

ID: `tutorial.onboarding.store.action`  
Suggested file: `lyra-tutorial-onboarding-store-action.mp3`

> Select and purchase upgrades when you are ready. Every permanent improvement helps your next run push farther.

### 22. OPERATOR GARAGE / MOD COLLECTION

ID: `tutorial.onboarding.menu-garage.garage`  
Suggested file: `lyra-tutorial-onboarding-menu-garage-garage.mp3`

> Mods recovered during runs can alter your build. Inspect and equip them through the Operator Garage and its Mod Collection station. Click OPERATOR GARAGE to continue.

### 23. YOUR INSTALLED MODS

ID: `tutorial.onboarding.garage.loadout`  
Suggested file: `lyra-tutorial-onboarding-garage-loadout.mp3`

> These five docks show the Mods installed for your next deployment. Each slot accepts its matching category, while Utility can support flexible builds.

### 24. OPEN MOD COLLECTION

ID: `tutorial.onboarding.garage.mod-collection`  
Suggested file: `lyra-tutorial-onboarding-garage-mod-collection.mp3`

> The Mod Collection is where recovered cards are inspected, upgraded, infused, equipped, or recycled. Click MOD COLLECTION to continue.

### 25. RECOVERED MOD ARCHIVE

ID: `tutorial.onboarding.mod-collection.archive`  
Suggested file: `lyra-tutorial-onboarding-mod-collection-archive.mp3`

> Every Mod card recovered during a run appears in this archive. Rarity, rank, infusion, and duplicate status remain attached to the exact card.

### 26. INSPECT YOUR BUILD

ID: `tutorial.onboarding.mod-collection.details`  
Suggested file: `lyra-tutorial-onboarding-mod-collection-details.mp3`

> Select a card to read its complete effect and manage compatible loadout slots. New Mods create new ways to approach future rounds.

### 27. TEACHING COMPLETE

ID: `tutorial.onboarding.mod-collection.complete`  
Suggested file: `lyra-tutorial-onboarding-mod-collection-complete.mp3`

> Your workstation is ready. Keep earning Credits, improving Mods, adapting your build, and pushing farther.

### 28. MOD RECOVERED

ID: `tutorial.context.first-mod.first-mod`  
Suggested file: `lyra-tutorial-context-first-mod-first-mod.mp3`

> Mods are awarded immediately. Visit the Mod Collection to inspect, upgrade, infuse, and equip the exact card you found.

### 29. CORRUPTED MOD

ID: `tutorial.context.corrupted-mod.corrupted`  
Suggested file: `lyra-tutorial-context-corrupted-mod-corrupted.mp3`

> Corrupted Mods carry an exceptional advantage and a real drawback. Read both effects before installing one.

### 30. LEGENDARY LOADOUT RULE

ID: `tutorial.context.legendary-mod.legendary`  
Suggested file: `lyra-tutorial-context-legendary-mod-legendary.mp3`

> Legendary Mods are extremely rare. Only one Legendary Mod may be equipped across the entire loadout.

### 31. BOMB DEFUSE IN PROGRESS

ID: `tutorial.context.first-defuse.defuse-alert`  
Suggested file: `lyra-tutorial-context-first-defuse-defuse-alert.mp3`

> Enemies are actively disarming the highlighted bomb. Eliminate or interrupt every defuser before their progress completes. The red HUD alert, yellow caution icon, warning audio, and striped site perimeter remain active while the danger continues.

### 32. OWNED CARD ARCHIVE

ID: `tutorial.progression.mod-collection.archive`  
Suggested file: `lyra-tutorial-progression-mod-collection-archive.mp3`

> Every acquired copy appears here. Border color identifies rarity; the duplicate marker counts extra copies regardless of upgrade level.

### 33. INSPECT & CONFIGURE

ID: `tutorial.progression.mod-collection.details`  
Suggested file: `lyra-tutorial-progression-mod-collection-details.mp3`

> The viewer shows the selected card's rank, infusion, category, and complete effect. Equip it to a compatible slot or the Utility/Wildcard dock.

### 34. INSTALL A MOD

ID: `tutorial.progression.mod-collection.equip`  
Suggested file: `lyra-tutorial-progression-mod-collection-equip.mp3`

> Use a valid category slot or the Utility/Wildcard dock whenever you want to install the selected card into the real next-deployment loadout.

### 35. UPGRADE OR RECYCLE

ID: `tutorial.progression.mod-collection.upgrade`  
Suggested file: `lyra-tutorial-progression-mod-collection-upgrade.mp3`

> Upgrade favorite cards with the displayed currencies. Unupgraded duplicate copies can be recycled into Plasma Chips.

### 36. BOSS SIGNAL DETECTED

ID: `tutorial.context.first-boss.boss`  
Suggested file: `lyra-tutorial-context-first-boss-boss.mp3`

> The highlighted boss combines its complete attack kit with arena security. Read the telegraphs, preserve Energy, and keep moving.

### 37. RETURN STRONGER

ID: `tutorial.progression.store.store`  
Suggested file: `lyra-tutorial-progression-store-store.mp3`

> Credits survive failed deployments. Spend them in the Store on permanent upgrades, then deploy again.

### 38. CREDITS

ID: `tutorial.progression.upgrades.credits`  
Suggested file: `lyra-tutorial-progression-upgrades-credits.mp3`

> This wallet value shows your Credits. Credits persist after every deployment and purchase permanent combat upgrades, cosmetics, and Mod improvements.

### 39. CORE TOKENS

ID: `tutorial.progression.upgrades.core-tokens`  
Suggested file: `lyra-tutorial-progression-upgrades-core-tokens.mp3`

> This wallet value shows Core Tokens, a persistent rare resource used by higher-rarity Mod upgrades and select unlocks.

### 40. CHOOSE A SYSTEM

ID: `tutorial.progression.upgrades.card`  
Suggested file: `lyra-tutorial-progression-upgrades-card.mp3`

> Each highlighted module shows its current level, next improvement, and exact cost. Select one to inspect it.

### 41. INSTALL AN UPGRADE

ID: `tutorial.progression.upgrades.purchase`  
Suggested file: `lyra-tutorial-progression-upgrades-purchase.mp3`

> Try an available upgrade. A successful install persists across every future run; if funds are short, the Store shows the exact amount still needed.

### 42. OPERATOR GARAGE

ID: `tutorial.progression.garage.garage`  
Suggested file: `lyra-tutorial-progression-garage-garage.mp3`

> Your Garage shows what is installed for the next deployment. Configure Mods, Signals, Contracts, cosmetics, and presets here.

### 43. NEXT DEPLOYMENT LOADOUT

ID: `tutorial.progression.garage-loadout.loadout`  
Suggested file: `lyra-tutorial-progression-garage-loadout-loadout.mp3`

> These five highlighted docks contain the Mods installed for your next deployment. Browse or unequip cards independently by slot.

### 44. OPERATIONS CONFIGURATION

ID: `tutorial.progression.garage-loadout.configuration`  
Suggested file: `lyra-tutorial-progression-garage-loadout-configuration.mp3`

> This terminal opens Operations, where you choose an unlocked mode and starting checkpoint. Contracts, Signals, fees, and progression remain linked to the same next deployment.

### 45. OVERDRIVE UNLOCKED

ID: `tutorial.progression.overdrive.overdrive`  
Suggested file: `lyra-tutorial-progression-overdrive-overdrive.mp3`

> This station opens Overdrive progression. Its constellation tiers let experienced operatives begin at later rounds after meeting each highest-round requirement.

## Existing recordings that still fall back to TTS in some situations

Recorded audio is accepted only when its transcript exactly matches the displayed instructions. This prevents a recording from teaching the wrong button. The 17 existing files cover the default English keyboard/mouse script; controller prompts, rebound ability keys, and the unavailable-action explanation can change that script.

### Controller variants — exact current text

These variants do not have matching recordings. Family names below identify the actual controller prompt text. A variant-aware recording map will be needed to select these files; adding another file under the same message ID alone would replace its default recording.

#### tutorial.onboarding.basic-controls.move — xbox, playstation, generic

> Use LEFT STICK to move.
> 
> A stationary operative makes an exceptionally convenient target. The security systems appreciate your cooperation.

#### tutorial.onboarding.basic-controls.aim — xbox, playstation, generic

> Neural link established. Motor control appears functional.
> 
> ...Encouraging.
> 
> Use the RIGHT STICK to aim toward your reticle. Movement and targeting operate independently.

#### tutorial.onboarding.basic-controls.fire — xbox

> Targeting link confirmed.
> 
> Press RT to fire.
> 
> Remember: your weapon consumes energy, Operative. Accuracy is considerably cheaper than panic.

#### tutorial.onboarding.basic-controls.fire — playstation, generic

> Targeting link confirmed.
> 
> Press R2 to fire.
> 
> Remember: your weapon consumes energy, Operative. Accuracy is considerably cheaper than panic.

#### tutorial.onboarding.defense.bombsite — xbox

> Move into the available bombsite and hold A to plant the charge.
> 
> Once armed, defend it until detonation.
> 
> And when the timer reaches zero, I recommend being somewhere else. The cleanup drones have already filed several complaints.

#### tutorial.onboarding.defense.bombsite — playstation

> Move into the available bombsite and hold CROSS to plant the charge.
> 
> Once armed, defend it until detonation.
> 
> And when the timer reaches zero, I recommend being somewhere else. The cleanup drones have already filed several complaints.

#### tutorial.onboarding.defense.bombsite — generic

> Move into the available bombsite and hold SOUTH to plant the charge.
> 
> Once armed, defend it until detonation.
> 
> And when the timer reaches zero, I recommend being somewhere else. The cleanup drones have already filed several complaints.

#### tutorial.onboarding.tactics.shield — xbox

> Operative, let’s improve your chances of surviving this.
> 
> Press RB to activate your SHIELD.
> 
> Shielding consumes energy and requires time to recharge before it can be activated again.
> 
> Use it deliberately. These operative frames are not what RWG would describe as... disposable.

#### tutorial.onboarding.tactics.shield — playstation, generic

> Operative, let’s improve your chances of surviving this.
> 
> Press R1 to activate your SHIELD.
> 
> Shielding consumes energy and requires time to recharge before it can be activated again.
> 
> Use it deliberately. These operative frames are not what RWG would describe as... disposable.

#### tutorial.onboarding.tactics.dash — xbox

> RWG has provided several additional methods of keeping you alive, including the DASH system.
> 
> Press LB to surge toward your current aim direction.
> 
> Dashing — as you may have suspected — consumes energy and has a cooldown.
> 
> Your survival will depend heavily on managing Health, Energy, movement, and timing. Preferably all four simultaneously.

#### tutorial.onboarding.tactics.dash — playstation, generic

> RWG has provided several additional methods of keeping you alive, including the DASH system.
> 
> Press L1 to surge toward your current aim direction.
> 
> Dashing — as you may have suspected — consumes energy and has a cooldown.
> 
> Your survival will depend heavily on managing Health, Energy, movement, and timing. Preferably all four simultaneously.

#### tutorial.onboarding.tactics.mine — xbox

> The highlighted HUD module represents your MINE RACK.
> 
> Mine rack online. Charges are limited, so placement matters.
> 
> Aim at a valid location and press B to deploy a mine.
> 
> RWG reminds all operatives that it accepts no liability for improper placement, accidental detonation, personal injury, or death.
> 
> A remarkably comprehensive waiver.

#### tutorial.onboarding.tactics.mine — playstation

> The highlighted HUD module represents your MINE RACK.
> 
> Mine rack online. Charges are limited, so placement matters.
> 
> Aim at a valid location and press CIRCLE to deploy a mine.
> 
> RWG reminds all operatives that it accepts no liability for improper placement, accidental detonation, personal injury, or death.
> 
> A remarkably comprehensive waiver.

#### tutorial.onboarding.tactics.mine — generic

> The highlighted HUD module represents your MINE RACK.
> 
> Mine rack online. Charges are limited, so placement matters.
> 
> Aim at a valid location and press EAST to deploy a mine.
> 
> RWG reminds all operatives that it accepts no liability for improper placement, accidental detonation, personal injury, or death.
> 
> A remarkably comprehensive waiver.

#### tutorial.onboarding.tactics.fence — xbox

> Press X to deploy an electric fence.
> 
> Fences can slow enemies and temporarily restrict their movement.
> 
> R&D also recommends firing through active fences. Their report describes the resulting effect as, quote, “wondrous.”
> 
> I requested a more technical explanation. None was provided. Use your discretion, Operative.

#### tutorial.onboarding.tactics.fence — playstation

> Press SQUARE to deploy an electric fence.
> 
> Fences can slow enemies and temporarily restrict their movement.
> 
> R&D also recommends firing through active fences. Their report describes the resulting effect as, quote, “wondrous.”
> 
> I requested a more technical explanation. None was provided. Use your discretion, Operative.

#### tutorial.onboarding.tactics.fence — generic

> Press WEST to deploy an electric fence.
> 
> Fences can slow enemies and temporarily restrict their movement.
> 
> R&D also recommends firing through active fences. Their report describes the resulting effect as, quote, “wondrous.”
> 
> I requested a more technical explanation. None was provided. Use your discretion, Operative.

#### tutorial.onboarding.tactics.turret — xbox

> Press Y to deploy RWG’s latest personal-security platform: an automated turret.
> 
> Turrets can defend territory while you attend to other threats.
> 
> Consider them temporary arena partners. Being everywhere at once is difficult.
> 
> They seem less troubled by the limitation.

#### tutorial.onboarding.tactics.turret — playstation

> Press TRIANGLE to deploy RWG’s latest personal-security platform: an automated turret.
> 
> Turrets can defend territory while you attend to other threats.
> 
> Consider them temporary arena partners. Being everywhere at once is difficult.
> 
> They seem less troubled by the limitation.

#### tutorial.onboarding.tactics.turret — generic

> Press NORTH to deploy RWG’s latest personal-security platform: an automated turret.
> 
> Turrets can defend territory while you attend to other threats.
> 
> Consider them temporary arena partners. Being everywhere at once is difficult.
> 
> They seem less troubled by the limitation.

### Rebound keyboard/mouse ability variants

These are the complete templates. The game replaces the braces with the chosen binding name. Arbitrary player bindings cannot be covered by one fixed recording; either record supported variants or retain TTS for custom bindings.

#### tutorial.onboarding.tactics.shield

> Operative, let’s improve your chances of surviving this.
> 
> Press {SHIELD} to activate your SHIELD.
> 
> Shielding consumes energy and requires time to recharge before it can be activated again.
> 
> Use it deliberately. These operative frames are not what RWG would describe as... disposable.

#### tutorial.onboarding.tactics.dash

> RWG has provided several additional methods of keeping you alive, including the DASH system.
> 
> Press {DASH} to surge toward your current aim direction.
> 
> Dashing — as you may have suspected — consumes energy and has a cooldown.
> 
> Your survival will depend heavily on managing Health, Energy, movement, and timing. Preferably all four simultaneously.

#### tutorial.onboarding.tactics.mine

> The highlighted HUD module represents your MINE RACK.
> 
> Mine rack online. Charges are limited, so placement matters.
> 
> Aim at a valid location and press {MINE} to deploy a mine.
> 
> RWG reminds all operatives that it accepts no liability for improper placement, accidental detonation, personal injury, or death.
> 
> A remarkably comprehensive waiver.

#### tutorial.onboarding.tactics.fence

> Press {FENCE} to deploy an electric fence.
> 
> Fences can slow enemies and temporarily restrict their movement.
> 
> R&D also recommends firing through active fences. Their report describes the resulting effect as, quote, “wondrous.”
> 
> I requested a more technical explanation. None was provided. Use your discretion, Operative.

#### tutorial.onboarding.tactics.turret

> Press {TURRET} to deploy RWG’s latest personal-security platform: an automated turret.
> 
> Turrets can defend territory while you attend to other threats.
> 
> Consider them temporary arena partners. Being everywhere at once is difficult.
> 
> They seem less troubled by the limitation.

### Action-unavailable variants

When an action-gated step cannot be performed, the game appends this exact sentence to the entire resolved tutorial line:

> This action is not currently available; continue when ready.

For a recorded line, that changes its transcript and selects TTS. The affected existing recording IDs are:

- `tutorial.onboarding.menu-welcome.start-local`
- `tutorial.onboarding.menu-resume-training.start-local`
- `tutorial.onboarding.basic-controls.move`
- `tutorial.onboarding.basic-controls.aim`
- `tutorial.onboarding.basic-controls.fire`
- `tutorial.onboarding.defense.bombsite`
- `tutorial.onboarding.defense.enemy`
- `tutorial.onboarding.tactics.shield`
- `tutorial.onboarding.tactics.dash`
- `tutorial.onboarding.tactics.mine`
- `tutorial.onboarding.tactics.fence`
- `tutorial.onboarding.tactics.turret`

The machine-readable inventory includes each complete default-keyboard unavailable-action transcript. Controller or custom-key versions use their resolved full text plus the same suffix. Tutorial lines already listed in the 45-line recording list can receive the same suffix when action-gated.

### Other fallback conditions

- A language other than `en-US` has no registered custom audio map. The current registry text remains English; selecting a different language does not supply a translation.
- A missing, unreadable, or failed audio file can fall through to TTS even for one of the 17 mapped messages.
- The development voice lab can explicitly force TTS for any registered message. That is a preview control, not additional authored dialogue.
- Echo currently has three ability sound-effect cues and no authored LYRA dialogue entry. Those synthesized cues are SFX, not TTS voice lines.

## Existing files checked

| Message ID | Custom file |
| --- | --- |
| `tutorial.onboarding.menu-welcome.welcome` | `lyrawelcome.mp3` |
| `tutorial.onboarding.menu-welcome.advanced-preview` | `lyrasupremepreview.mp3` |
| `tutorial.onboarding.menu-welcome.start-local` | `lyrastartlocal.mp3` |
| `tutorial.onboarding.menu-resume-training.start-local` | `lyrareturntotraining.mp3` |
| `tutorial.onboarding.basic-controls.welcome` | `lyraenteringarena.mp3` |
| `tutorial.onboarding.basic-controls.move` | `lyramovement.mp3` |
| `tutorial.onboarding.basic-controls.aim` | `lyraaiming.mp3` |
| `tutorial.onboarding.basic-controls.fire` | `lyrafiring.mp3` |
| `tutorial.onboarding.defense.bombsite` | `lyraplantingcharge.mp3` |
| `tutorial.onboarding.defense.enemy` | `lyrafirstcombatdefusers.mp3` |
| `tutorial.onboarding.hud.vitals` | `lyrahealthenergy.mp3` |
| `tutorial.onboarding.tactics.shield` | `lyrashield.mp3` |
| `tutorial.onboarding.tactics.dash` | `lyradash.mp3` |
| `tutorial.onboarding.tactics.mine` | `lyramines.mp3` |
| `tutorial.onboarding.tactics.fence` | `lyraelectricfences.mp3` |
| `tutorial.onboarding.tactics.turret` | `lyraturrets.mp3` |
| `tutorial.onboarding.certification.release` | `lyratrainingcomplete.mp3` |

Unmapped audio files in the LYRA folder: **none**.

Regenerate this inventory after adding or changing dialogue:

```powershell
node --experimental-strip-types scripts/audit-lyra-voice-coverage.mjs
```

[Machine-readable inventory and complete variant text](lyra-voice-coverage.json).
