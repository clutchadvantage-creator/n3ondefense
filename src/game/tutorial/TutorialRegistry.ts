import { compactBindingLabel, INTERACT_BINDING, PRIMARY_FIRE_BINDING } from '../config/controls.ts';
import type { TutorialSequenceDefinition } from './TutorialTypes.ts';

const key = (binding: Parameters<typeof compactBindingLabel>[0]): string => compactBindingLabel(binding);

export const TUTORIAL_SEQUENCES: readonly TutorialSequenceDefinition[] = [
  {
    id: 'onboarding.basic-controls', scene: 'arena', title: 'INITIAL DEPLOYMENT', autoStart: true, skippable: true,
    steps: [
      { id: 'welcome', eyebrow: 'N3ON PROTOCOL // LIVE TRAINING', title: 'WELCOME, OPERATIVE', body: 'This training runs inside a real deployment. Read each instruction, acknowledge information screens, then perform the requested combat actions yourself.', mode: 'hard-pause', completion: { type: 'manual' } },
      { id: 'identify-player', target: 'world.player', title: 'YOUR OPERATIVE', body: 'The highlighted unit is your operative. Keep it moving to avoid attacks and protect it while defending each planted charge.', mode: 'hard-pause', spotlight: 'circle', completion: { type: 'manual' } },
      { id: 'move', target: 'world.player', title: 'MOVE YOUR OPERATIVE', body: 'Use W A S D to move through the arena. This step advances after the operative actually changes position.', inputDemo: ['W', 'A', 'S', 'D'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.playerMoved' } },
      { id: 'aim', target: 'world.player', title: 'AIM AT THREATS', body: 'Move the mouse to rotate your operative toward the reticle. Aim independently while continuing to move.', inputDemo: ['MOUSE'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.aimChanged' } },
      { id: 'fire', target: 'world.player', title: 'FIRE YOUR WEAPON', body: `Press ${key(PRIMARY_FIRE_BINDING)} to fire toward the reticle. Every shot consumes Energy, so watch the cyan Energy bar.`, inputDemo: ['LMB'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.weaponFired' } }
    ]
  },
  {
    id: 'onboarding.defense', scene: 'arena', title: 'BOMBSITE DEFENSE', autoStart: true, prerequisite: 'onboarding.basic-controls', skippable: true,
    steps: [
      { id: 'bombsite', target: 'world.bombsite', title: 'ARM THE CHARGE', body: `Move into the available bombsite and hold ${key(INTERACT_BINDING)}. Once planted, defend it until detonation.`, inputDemo: ['E'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'objective.bombArmed' } },
      { id: 'enemy', target: 'world.enemy', title: 'HOSTILE CONTACT', body: 'Damage a hostile. Defusers must be interrupted before they disarm the active charge.', mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.enemyDamaged' } },
      { id: 'mine', target: 'hud.mine', title: 'DEPLOY A MINE', body: 'The highlighted HUD module shows your Mine rack and readiness. Aim at a valid location and press {MINE} to deploy area defense.', inputDemo: ['{MINE}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.mine' } },
      { id: 'fence', target: 'hud.fence', title: 'BUILD A FENCE', body: 'Press {FENCE} to place an electric fence. Fire through it to split projectiles.', illustration: 'OPERATIVE  >  SHOT  >  FENCE  >  SPLIT SHOTS', inputDemo: ['{FENCE}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.fence' } },
      { id: 'turret', target: 'hud.turret', title: 'DEPLOY A TURRET', body: 'Press {TURRET} near a bombsite to help stop defuse attempts.', inputDemo: ['{TURRET}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.turret' } }
    ]
  },
  {
    id: 'onboarding.hud', scene: 'arena', title: 'TACTICAL HUD', autoStart: true, prerequisite: 'onboarding.defense', skippable: true,
    steps: [
      { id: 'vitals', target: 'hud.vitals', title: 'OPERATIVE VITALS', body: 'Pink tracks Health and cyan tracks Energy. Weapon fire and abilities consume Energy; incoming damage reduces Health.', mode: 'hard-pause', completion: { type: 'manual' } },
      { id: 'objective', target: 'hud.objective', title: 'TACTICAL OBJECTIVE', body: 'This center console shows what to do next, the active charge timer, and an urgent DEFUSE alert when enemies begin disarming a bomb.', mode: 'hard-pause', completion: { type: 'manual' } },
      { id: 'stats', target: 'hud.stats', title: 'RUN CACHE', body: 'This panel tracks the current round, active hostiles, and persistent resources collected during the deployment.', mode: 'hard-pause', completion: { type: 'manual' } },
      { id: 'abilities', target: 'hud.abilities', title: 'COMBAT COMMAND DECK', body: 'Each module shows its key, remaining uses, and readiness. A cooldown number appears while that ability is recharging.', mode: 'hard-pause', completion: { type: 'manual' } }
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
      { id: 'equip', target: 'mods.details', title: 'INSTALL A MOD', body: 'Use a valid category slot or the Utility/Wildcard dock to install the selected card into the real next-deployment loadout.', mode: 'menu', completion: { type: 'event', event: 'mods.equipped' } },
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
      { id: 'configuration', target: 'garage.configuration', title: 'RUN CONFIGURATION', body: 'This terminal shows the Protocol, Contract, and Signal that will apply to the next run, including their fees and requirements.', mode: 'menu', completion: { type: 'manual' } }
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
