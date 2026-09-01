import type { TutorialSequenceDefinition } from './TutorialTypes.ts';

export const TUTORIAL_SEQUENCES: readonly TutorialSequenceDefinition[] = [
  {
    id: 'onboarding.menu-welcome', scene: 'menu', title: 'WELCOME TO N3ONDEFENSE', autoStart: true, freshProfileOnly: true,
    firstRunStages: ['welcome-main-menu', 'waiting-for-start-local'], skippable: true,
    steps: [
      { id: 'welcome', eyebrow: 'N3ON PROTOCOL // INITIAL LINK', title: 'WELCOME TO THE ARENA, OPERATIVE!', body: 'Enter the arena, plant charges, defend them from enemies, and survive increasingly difficult rounds. Earn Credits for permanent upgrades and recover Mods that reshape future builds.', mode: 'menu', advanceLabel: 'NEXT', completion: { type: 'manual' } },
      { id: 'start-local', target: 'menu.start-local', eyebrow: 'N3ON PROTOCOL // TRAINING DEPLOYMENT', title: 'START LOCAL', body: 'Start your first training run here. Local play keeps the run local and does not publish scores to the online leaderboards. Click START LOCAL to continue.', mode: 'menu', targetPadding: 12, completion: { type: 'event', event: 'ui.startLocalSelected' } }
    ]
  },
  {
    id: 'onboarding.menu-resume-training', scene: 'menu', title: 'RESUME TRAINING', autoStart: true,
    firstRunStages: ['arena-teaching'], skippable: true,
    steps: [{ id: 'start-local', target: 'menu.start-local', eyebrow: 'N3ON PROTOCOL // TRAINING INCOMPLETE', title: 'RETURN TO LOCAL TRAINING', body: 'Your Arena Teaching is still in progress. Click START LOCAL to resume the training deployment.', mode: 'menu', targetPadding: 12, completion: { type: 'event', event: 'ui.startLocalSelected' } }]
  },
  {
    id: 'onboarding.basic-controls', scene: 'arena', title: 'INITIAL DEPLOYMENT', autoStart: true, firstRunStages: ['arena-teaching'], skippable: true,
    steps: [
      { id: 'welcome', eyebrow: 'N3ON PROTOCOL // LIVE TRAINING', title: 'WELCOME, OPERATIVE', body: 'This training runs inside a real deployment. Read each instruction, acknowledge information screens, then perform the requested combat actions yourself.', mode: 'hard-pause', completion: { type: 'manual' } },
      { id: 'identify-player', target: 'world.player', title: 'YOUR OPERATIVE', body: 'The highlighted unit is your operative. Keep it moving to avoid attacks and protect it while defending each planted charge.', mode: 'hard-pause', spotlight: 'circle', completion: { type: 'manual' } },
      { id: 'move', target: 'world.player', title: 'MOVE YOUR OPERATIVE', body: 'Use {MOVE} to move through the arena. This step advances after the operative actually changes position.', inputDemo: ['{MOVE}'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.playerMoved' } },
      { id: 'aim', target: 'world.player', title: 'AIM AT THREATS', body: 'Use {AIM} to rotate your operative toward the reticle. Aim independently while continuing to move.', inputDemo: ['{AIM}'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.aimChanged' } },
      { id: 'fire', target: 'world.player', title: 'FIRE YOUR WEAPON', body: 'Press {FIRE} to fire toward the reticle. Every shot consumes Energy, so watch the cyan Energy bar.', inputDemo: ['{FIRE}'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.weaponFired' } }
    ]
  },
  {
    id: 'onboarding.defense', scene: 'arena', title: 'BOMBSITE DEFENSE', autoStart: true, firstRunStages: ['arena-teaching'], prerequisite: 'onboarding.basic-controls', skippable: true,
    steps: [
      { id: 'bombsite', target: 'world.bombsite', title: 'ARM THE CHARGE', body: 'Move into the available bombsite and hold {INTERACT}. Once planted, defend it until detonation.', inputDemo: ['{INTERACT}'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'objective.bombArmed' } },
      { id: 'enemy', target: 'world.enemy', title: 'HOSTILE CONTACT', body: 'Damage a hostile. Defusers must be interrupted before they disarm the active charge.', mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.enemyDamaged' } },
      { id: 'mine', target: 'hud.mine', title: 'DEPLOY A MINE', body: 'The highlighted HUD module shows your Mine rack and readiness. Aim at a valid location and press {MINE} to deploy area defense.', inputDemo: ['{MINE}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.mine' } },
      { id: 'fence', target: 'hud.fence', title: 'BUILD A FENCE', body: 'Press {FENCE} to place an electric fence. Fire through it to split projectiles.', illustration: 'OPERATIVE  >  SHOT  >  FENCE  >  SPLIT SHOTS', inputDemo: ['{FENCE}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.fence' } },
      { id: 'turret', target: 'hud.turret', title: 'DEPLOY A TURRET', body: 'Press {TURRET} near a bombsite to help stop defuse attempts.', inputDemo: ['{TURRET}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.turret' } },
      { id: 'dash', target: 'hud.abilities', title: 'DASH THROUGH DANGER', body: 'Press {DASH} to surge toward your aim direction. Dashing costs Energy and then enters cooldown.', inputDemo: ['{DASH}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.dash' } },
      { id: 'shield', target: 'hud.shield', title: 'RAISE YOUR SHIELD', body: 'Press {SHIELD} to form a temporary energy barrier. The shield costs Energy and cannot reactivate until its cooldown completes.', inputDemo: ['{SHIELD}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.shield' } }
    ]
  },
  {
    id: 'onboarding.hud', scene: 'arena', title: 'TACTICAL HUD', autoStart: true, firstRunStages: ['arena-teaching'], prerequisite: 'onboarding.defense', skippable: true,
    steps: [
      { id: 'vitals', target: 'hud.vitals', title: 'OPERATIVE VITALS', body: 'Pink tracks Health and cyan tracks Energy. Weapon fire and abilities consume Energy; incoming damage reduces Health.', mode: 'hard-pause', completion: { type: 'manual' } },
      { id: 'objective', target: 'hud.objective', title: 'TACTICAL OBJECTIVE', body: 'This center console shows what to do next, the active charge timer, and an urgent DEFUSE alert when enemies begin disarming a bomb.', mode: 'hard-pause', completion: { type: 'manual' } },
      { id: 'stats', target: 'hud.stats', title: 'RUN CACHE', body: 'This panel tracks the current round, active hostiles, and persistent resources collected during the deployment.', mode: 'hard-pause', completion: { type: 'manual' } },
      { id: 'abilities', target: 'hud.abilities', title: 'COMBAT COMMAND DECK', body: 'Each module shows its key, remaining uses, and readiness. A cooldown number appears while that ability is recharging.', mode: 'hard-pause', completion: { type: 'manual' } }
    ]
  },
  {
    id: 'onboarding.menu-store', scene: 'menu', title: 'PERMANENT PROGRESSION', autoStart: true,
    firstRunStages: ['waiting-for-store'], skippable: true,
    steps: [{ id: 'store', target: 'menu.store', eyebrow: 'N3ON PROTOCOL // POST-DEPLOYMENT', title: 'STORE / UPGRADES', body: 'Credits earned in the Arena persist between runs. Spend them on permanent upgrades that help your operative push farther. Click STORE to continue.', mode: 'menu', targetPadding: 12, completion: { type: 'event', event: 'ui.storeSelected' } }]
  },
  {
    id: 'onboarding.store', scene: 'upgrades', title: 'PERMANENT UPGRADES', autoStart: true,
    firstRunStages: ['store-teaching'], skippable: true,
    steps: [
      { id: 'credits', target: 'store.wallet.credits', title: 'CREDITS PERSIST', body: 'Credits earned during deployments remain in your wallet and fund permanent improvements.', mode: 'menu', advanceLabel: 'CONTINUE', completion: { type: 'manual' } },
      { id: 'card', target: 'store.upgrade-card', title: 'CHOOSE A SYSTEM', body: 'Each upgrade module shows its current level, next improvement, and cost. Upgrades apply to future deployments.', mode: 'menu', advanceLabel: 'CONTINUE', completion: { type: 'manual' } },
      { id: 'action', target: 'store.upgrade-action', title: 'RETURN STRONGER', body: 'Select and purchase upgrades when you are ready. Every permanent improvement helps your next run push farther.', mode: 'menu', advanceLabel: 'CONTINUE', completion: { type: 'manual' } }
    ]
  },
  {
    id: 'onboarding.menu-garage', scene: 'menu', title: 'MOD LOADOUT', autoStart: true,
    firstRunStages: ['waiting-for-garage'], skippable: true,
    steps: [{ id: 'garage', target: 'menu.garage', eyebrow: 'N3ON PROTOCOL // LOADOUT SYSTEMS', title: 'OPERATOR GARAGE / MOD COLLECTION', body: 'Mods recovered during runs can alter your build. Inspect and equip them through the Operator Garage and its Mod Collection station. Click OPERATOR GARAGE to continue.', mode: 'menu', targetPadding: 12, completion: { type: 'event', event: 'ui.garageSelected' } }]
  },
  {
    id: 'onboarding.garage', scene: 'garage', title: 'OPERATOR LOADOUT', autoStart: true,
    firstRunStages: ['garage-teaching'], skippable: true,
    steps: [
      { id: 'loadout', target: 'garage.loadout', title: 'YOUR INSTALLED MODS', body: 'These five docks show the Mods installed for your next deployment. Each slot accepts its matching category, while Utility can support flexible builds.', mode: 'menu', advanceLabel: 'CONTINUE', completion: { type: 'manual' } },
      { id: 'mod-collection', target: 'garage.mod-collection', title: 'OPEN MOD COLLECTION', body: 'The Mod Collection is where recovered cards are inspected, upgraded, infused, equipped, or recycled. Click MOD COLLECTION to continue.', mode: 'menu', targetPadding: 12, completion: { type: 'event', event: 'ui.modCollectionSelected' } }
    ]
  },
  {
    id: 'onboarding.mod-collection', scene: 'mods', title: 'MOD COLLECTION', autoStart: true,
    firstRunStages: ['mod-collection-teaching'], skippable: true,
    steps: [
      { id: 'archive', target: 'mods.archive', title: 'RECOVERED MOD ARCHIVE', body: 'Every Mod card recovered during a run appears in this archive. Rarity, rank, infusion, and duplicate status remain attached to the exact card.', mode: 'menu', advanceLabel: 'CONTINUE', completion: { type: 'manual' } },
      { id: 'details', target: 'mods.details', title: 'INSPECT YOUR BUILD', body: 'Select a card to read its complete effect and manage compatible loadout slots. New Mods create new ways to approach future rounds.', mode: 'menu', advanceLabel: 'CONTINUE', completion: { type: 'manual' } },
      { id: 'complete', target: 'mods.details', title: 'TEACHING COMPLETE', body: 'Your workstation is ready. Keep earning Credits, improving Mods, adapting your build, and pushing farther.', mode: 'menu', advanceLabel: 'CONTINUE', completion: { type: 'manual' } }
    ]
  },
  {
    id: 'context.first-mod', scene: 'arena', title: 'MOD ACQUISITION', triggerEvent: 'mod.revealed', contextual: true,
    steps: [{ id: 'first-mod', title: 'MOD RECOVERED', body: 'Mods are awarded immediately. Visit the Mod Collection to inspect, upgrade, infuse, and equip the exact card you found.', mode: 'hard-pause', completion: { type: 'manual' } }]
  },
  {
    id: 'context.corrupted-mod', scene: 'arena', title: 'CORRUPTED HARDWARE', triggerEvent: 'mod.corruptedRevealed', contextual: true,
    steps: [{ id: 'corrupted', title: 'CORRUPTED MOD', body: 'Corrupted Mods carry an exceptional advantage and a real drawback. Read both effects before installing one.', mode: 'hard-pause', completion: { type: 'manual' } }]
  },
  {
    id: 'context.legendary-mod', scene: 'arena', title: 'LEGENDARY HARDWARE', triggerEvent: 'mod.legendaryRevealed', contextual: true,
    steps: [{ id: 'legendary', title: 'LEGENDARY LOADOUT RULE', body: 'Legendary Mods are extremely rare. Only one Legendary Mod may be equipped across the entire loadout.', mode: 'hard-pause', completion: { type: 'manual' } }]
  },
  {
    id: 'context.first-defuse', scene: 'arena', title: 'DEFUSE EMERGENCY', triggerEvent: 'objective.defuseStarted', contextual: true,
    steps: [{ id: 'defuse-alert', target: 'world.defusingBombsite', title: 'BOMB DEFUSE IN PROGRESS', body: 'Enemies are actively disarming the highlighted bomb. Eliminate or interrupt every defuser before their progress completes. The red HUD alert, yellow caution icon, warning audio, and striped site perimeter remain active while the danger continues.', mode: 'hard-pause', spotlight: 'circle', targetPadding: 20, completion: { type: 'manual' } }]
  },
  {
    id: 'progression.mod-collection', scene: 'mods', title: 'MOD COLLECTION', triggerEvent: 'ui.modCollectionOpened', contextual: true,
    steps: [
      { id: 'archive', target: 'mods.archive', title: 'OWNED CARD ARCHIVE', body: 'Every acquired copy appears here. Border color identifies rarity; the duplicate marker counts extra copies regardless of upgrade level.', mode: 'menu', completion: { type: 'manual' } },
      { id: 'details', target: 'mods.details', title: 'INSPECT & CONFIGURE', body: "The viewer shows the selected card's rank, infusion, category, and complete effect. Equip it to a compatible slot or the Utility/Wildcard dock.", mode: 'menu', completion: { type: 'manual' } },
      { id: 'equip', target: 'mods.details', title: 'INSTALL A MOD', body: 'Use a valid category slot or the Utility/Wildcard dock whenever you want to install the selected card into the real next-deployment loadout.', mode: 'menu', completion: { type: 'manual' } },
      { id: 'upgrade', target: 'mods.details', title: 'UPGRADE OR RECYCLE', body: 'Upgrade favorite cards with the displayed currencies. Unupgraded duplicate copies can be recycled into Plasma Chips.', mode: 'menu', completion: { type: 'manual' } }
    ]
  },
  {
    id: 'context.first-boss', scene: 'arena', title: 'BOSS CONTACT', triggerEvent: 'combat.bossStarted', contextual: true,
    steps: [{ id: 'boss', target: 'world.boss', title: 'BOSS SIGNAL DETECTED', body: 'The highlighted boss combines its complete attack kit with arena security. Read the telegraphs, preserve Energy, and keep moving.', mode: 'hard-pause', spotlight: 'circle', completion: { type: 'manual' } }]
  },
  {
    id: 'progression.store', scene: 'menu', title: 'PERSISTENT PROGRESSION', triggerEvent: 'progression.firstFailure', contextual: true,
    steps: [{ id: 'store', target: 'menu.store', title: 'RETURN STRONGER', body: 'Credits survive failed deployments. Spend them in the Store on permanent upgrades, then deploy again.', mode: 'menu', completion: { type: 'event', event: 'ui.storeOpened' } }]
  },
  {
    id: 'progression.upgrades', scene: 'upgrades', title: 'PERMANENT UPGRADES', triggerEvent: 'ui.upgradeStoreOpened', prerequisite: 'progression.store', contextual: true,
    steps: [
      { id: 'credits', target: 'store.wallet.credits', title: 'CREDITS', body: 'This wallet value shows your Credits. Credits persist after every deployment and purchase permanent combat upgrades, cosmetics, and Mod improvements.', mode: 'menu', completion: { type: 'manual' } },
      { id: 'core-tokens', target: 'store.wallet.core-tokens', title: 'CORE TOKENS', body: 'This wallet value shows Core Tokens, a persistent rare resource used by higher-rarity Mod upgrades and select unlocks.', mode: 'menu', completion: { type: 'manual' } },
      { id: 'card', target: 'store.upgrade-card', title: 'CHOOSE A SYSTEM', body: 'Each highlighted module shows its current level, next improvement, and exact cost. Select one to inspect it.', mode: 'menu', completion: { type: 'manual' } },
      { id: 'purchase', target: 'store.upgrade-action', title: 'INSTALL AN UPGRADE', body: 'Try an available upgrade. A successful install persists across every future run; if funds are short, the Store shows the exact amount still needed.', mode: 'menu', completion: { type: 'event', event: 'economy.upgradePurchaseAttempted' } }
    ]
  },
  {
    id: 'progression.garage', scene: 'menu', title: 'LOADOUT WORKSTATION', triggerEvent: 'progression.firstModOwned', contextual: true,
    steps: [{ id: 'garage', target: 'menu.garage', title: 'OPERATOR GARAGE', body: 'Your Garage shows what is installed for the next deployment. Configure Mods, Signals, Contracts, cosmetics, and presets here.', mode: 'menu', completion: { type: 'event', event: 'ui.garageOpened' } }]
  },
  {
    id: 'progression.garage-loadout', scene: 'garage', title: 'LOADOUT ARRAY', triggerEvent: 'ui.garageSceneOpened', prerequisite: 'progression.garage', contextual: true,
    steps: [
      { id: 'loadout', target: 'garage.loadout', title: 'NEXT DEPLOYMENT LOADOUT', body: 'These five highlighted docks contain the Mods installed for your next deployment. Browse or unequip cards independently by slot.', mode: 'menu', completion: { type: 'manual' } },
      { id: 'configuration', target: 'garage.configuration', title: 'OPERATIONS CONFIGURATION', body: 'This terminal opens Operations, where you choose an unlocked mode and starting checkpoint. Contracts, Signals, fees, and progression remain linked to the same next deployment.', mode: 'menu', completion: { type: 'manual' } }
    ]
  },
  {
    id: 'progression.overdrive', scene: 'garage', title: 'OVERDRIVE PROTOCOLS', triggerEvent: 'progression.overdriveUnlocked', contextual: true,
    steps: [{ id: 'overdrive', target: 'garage.overdrive', title: 'OVERDRIVE UNLOCKED', body: 'This station opens Overdrive progression. Its constellation tiers let experienced operatives begin at later rounds after meeting each highest-round requirement.', mode: 'menu', completion: { type: 'manual' } }]
  }
] as const;

export const TUTORIAL_SEQUENCE_BY_ID = new Map(TUTORIAL_SEQUENCES.map((sequence) => [sequence.id, sequence]));

export const TUTORIAL_REPLAY_GROUPS = [
  { label: 'BASIC CONTROLS', sequenceId: 'onboarding.basic-controls' },
  { label: 'DEFENDING A BOMBSITE', sequenceId: 'onboarding.defense' },
  { label: 'HUD & ABILITIES', sequenceId: 'onboarding.hud' },
  { label: 'PROGRESSION & STORE', sequenceId: 'progression.store', followups: ['progression.upgrades'] },
  { label: 'GARAGE & LOADOUT', sequenceId: 'progression.garage', followups: ['progression.garage-loadout'] },
  { label: 'MOD COLLECTION', sequenceId: 'progression.mod-collection' }
] as const;
