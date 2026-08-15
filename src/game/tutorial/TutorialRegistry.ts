import { compactBindingLabel, INTERACT_BINDING, PRIMARY_FIRE_BINDING } from '../config/controls.ts';
import type { TutorialSequenceDefinition } from './TutorialTypes.ts';

const key = (binding: Parameters<typeof compactBindingLabel>[0]): string => compactBindingLabel(binding);

export const TUTORIAL_SEQUENCES: readonly TutorialSequenceDefinition[] = [
  {
    id: 'onboarding.basic-controls', scene: 'arena', title: 'INITIAL DEPLOYMENT', autoStart: true, skippable: true,
    steps: [
      { id: 'welcome', eyebrow: 'N3ON PROTOCOL // LIVE TRAINING', title: 'WELCOME, OPERATIVE', body: 'Training is attached to the live deployment. Watch the system, then perform each action yourself.', mode: 'hard-pause', completion: { type: 'auto', delayMs: 2800 } },
      { id: 'identify-player', target: 'world.player', title: 'YOUR OPERATIVE', body: 'This is your active operative. Keep it moving and protect it while defending each charge.', mode: 'hard-pause', spotlight: 'circle', completion: { type: 'auto', delayMs: 2300 } },
      { id: 'move', target: 'world.player', title: 'MOVE', body: 'Use W A S D to move through the arena.', inputDemo: ['W', 'A', 'S', 'D'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.playerMoved' } },
      { id: 'aim', target: 'world.player', title: 'AIM', body: 'Move the mouse to rotate your operative toward the reticle.', inputDemo: ['MOUSE'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.aimChanged' } },
      { id: 'fire', target: 'world.player', title: 'FIRE', body: `Press ${key(PRIMARY_FIRE_BINDING)} to fire. Weapon fire consumes energy.`, inputDemo: ['LMB'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.weaponFired' } }
    ]
  },
  {
    id: 'onboarding.defense', scene: 'arena', title: 'BOMBSITE DEFENSE', autoStart: true, prerequisite: 'onboarding.basic-controls', skippable: true,
    steps: [
      { id: 'bombsite', target: 'world.bombsite', title: 'ARM THE CHARGE', body: `Move into the available bombsite and hold ${key(INTERACT_BINDING)}. Once planted, defend it until detonation.`, inputDemo: ['E'], mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'objective.bombArmed' } },
      { id: 'enemy', target: 'world.enemy', title: 'HOSTILE CONTACT', body: 'Damage a hostile. Defusers must be interrupted before they disarm the active charge.', mode: 'live', spotlight: 'circle', completion: { type: 'event', event: 'combat.enemyDamaged' } },
      { id: 'mine', target: 'hud.mine', title: 'DEPLOY A MINE', body: 'Aim at a valid location and press {MINE}.', inputDemo: ['{MINE}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.mine' } },
      { id: 'fence', target: 'hud.fence', title: 'BUILD A FENCE', body: 'Press {FENCE} to place an electric fence. Fire through it to split projectiles.', illustration: 'OPERATIVE  →  SHOT  →  FENCE  →  SPLIT SHOTS', inputDemo: ['{FENCE}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.fence' } },
      { id: 'turret', target: 'hud.turret', title: 'DEPLOY A TURRET', body: 'Press {TURRET} near a bombsite to help stop defuse attempts.', inputDemo: ['{TURRET}'], mode: 'live', completion: { type: 'event', event: 'combat.ability.turret' } }
    ]
  },
  {
    id: 'onboarding.hud', scene: 'arena', title: 'TACTICAL HUD', autoStart: true, prerequisite: 'onboarding.defense', skippable: true,
    steps: [
      { id: 'vitals', target: 'hud.vitals', title: 'VITALS', body: 'Pink tracks health. Cyan tracks energy. Both update immediately as combat changes them.', mode: 'hard-pause', completion: { type: 'auto', delayMs: 2400 } },
      { id: 'objective', target: 'hud.objective', title: 'CURRENT OBJECTIVE', body: 'The center console always shows the next immediate objective and active charge timer.', mode: 'hard-pause', completion: { type: 'auto', delayMs: 2400 } },
      { id: 'stats', target: 'hud.stats', title: 'RUN STATUS', body: 'Round, remaining hostiles, and collected resources are tracked here.', mode: 'hard-pause', completion: { type: 'auto', delayMs: 2400 } },
      { id: 'abilities', target: 'hud.abilities', title: 'ABILITY RACK', body: 'Illuminated modules are ready. Cooldown numbers appear only while a module recharges.', mode: 'hard-pause', completion: { type: 'auto', delayMs: 2600 } }
    ]
  },
  {
    id: 'context.first-mod', scene: 'arena', title: 'MOD ACQUISITION', triggerEvent: 'mod.revealed', contextual: true,
    steps: [{ id: 'first-mod', title: 'MOD RECOVERED', body: 'Mods are awarded immediately. Visit the Mod Collection to inspect, upgrade, infuse, and equip the exact card you found.', mode: 'hard-pause', completion: { type: 'auto', delayMs: 3200 } }]
  },
  {
    id: 'context.corrupted-mod', scene: 'arena', title: 'CORRUPTED HARDWARE', triggerEvent: 'mod.corruptedRevealed', contextual: true,
    steps: [{ id: 'corrupted', title: 'CORRUPTED MOD', body: 'Corrupted Mods carry an exceptional advantage and a real drawback. Read both effects before installing one.', mode: 'hard-pause', completion: { type: 'auto', delayMs: 3200 } }]
  },
  {
    id: 'context.legendary-mod', scene: 'arena', title: 'LEGENDARY HARDWARE', triggerEvent: 'mod.legendaryRevealed', contextual: true,
    steps: [{ id: 'legendary', title: 'LEGENDARY LOADOUT RULE', body: 'Legendary Mods are extremely rare. Only one Legendary Mod may be equipped across the entire loadout.', mode: 'hard-pause', completion: { type: 'auto', delayMs: 3200 } }]
  },
  {
    id: 'progression.mod-collection', scene: 'mods', title: 'MOD COLLECTION', triggerEvent: 'ui.modCollectionOpened', contextual: true,
    steps: [
      { id: 'archive', target: 'mods.archive', title: 'OWNED CARD ARCHIVE', body: 'Every acquired copy appears here. Border color identifies rarity; the duplicate marker counts extra copies regardless of upgrade level.', mode: 'menu', completion: { type: 'auto', delayMs: 3200 } },
      { id: 'details', target: 'mods.details', title: 'INSPECT & CONFIGURE', body: 'The viewer shows the exact card, rank, infusion, category, and full effect. Equip it to a valid slot or the Utility/Wildcard dock.', mode: 'menu', completion: { type: 'auto', delayMs: 3200 } },
      { id: 'equip', target: 'mods.details', title: 'INSTALL A MOD', body: 'Use a valid category slot or the Utility/Wildcard dock to install the selected card into the real next-deployment loadout.', mode: 'menu', completion: { type: 'event', event: 'mods.equipped' } },
      { id: 'upgrade', target: 'mods.details', title: 'UPGRADE OR RECYCLE', body: 'Upgrade favorite cards with the displayed currencies. Unupgraded duplicate copies can be recycled into Plasma Chips.', mode: 'menu', completion: { type: 'auto', delayMs: 3300 } }
    ]
  },
  {
    id: 'context.first-boss', scene: 'arena', title: 'BOSS CONTACT', triggerEvent: 'combat.bossStarted', contextual: true,
    steps: [{ id: 'boss', target: 'world.boss', title: 'BOSS SIGNAL DETECTED', body: 'Boss attacks combine with arena security. Read the telegraphs, preserve energy, and keep moving.', mode: 'hard-pause', spotlight: 'circle', completion: { type: 'auto', delayMs: 3200 } }]
  },
  {
    id: 'progression.store', scene: 'menu', title: 'PERSISTENT PROGRESSION', triggerEvent: 'progression.firstFailure', contextual: true,
    steps: [{ id: 'store', target: 'menu.store', title: 'RETURN STRONGER', body: 'Credits survive failed deployments. Spend them in the Store on permanent upgrades, then deploy again.', mode: 'menu', completion: { type: 'event', event: 'ui.storeOpened' } }]
  },
  {
    id: 'progression.upgrades', scene: 'upgrades', title: 'PERMANENT UPGRADES', triggerEvent: 'ui.upgradeStoreOpened', prerequisite: 'progression.store', contextual: true,
    steps: [
      { id: 'credits', target: 'store.wallet.credits', title: 'CREDITS', body: 'Credits persist after every deployment and purchase permanent combat upgrades, cosmetics, and Mod improvements.', mode: 'menu', completion: { type: 'auto', delayMs: 2800 } },
      { id: 'core-tokens', target: 'store.wallet.core-tokens', title: 'CORE TOKENS', body: 'Core Tokens are persistent rare resources used by higher-rarity Mod upgrades and select unlocks.', mode: 'menu', completion: { type: 'auto', delayMs: 2800 } },
      { id: 'card', target: 'store.upgrade-card', title: 'CHOOSE A SYSTEM', body: 'Each module shows its current level, next improvement, and cost. Select one to inspect it.', mode: 'menu', completion: { type: 'auto', delayMs: 2800 } },
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
      { id: 'loadout', target: 'garage.loadout', title: 'NEXT DEPLOYMENT LOADOUT', body: 'These five docks are the Mods that will be installed for your next deployment. Browse or unequip by slot.', mode: 'menu', completion: { type: 'auto', delayMs: 3300 } },
      { id: 'configuration', target: 'garage.configuration', title: 'RUN CONFIGURATION', body: 'Protocol, Contract, and Signal choices apply to the next run. Their fees and requirements remain visible here.', mode: 'menu', completion: { type: 'auto', delayMs: 3200 } }
    ]
  },
  {
    id: 'progression.overdrive', scene: 'garage', title: 'OVERDRIVE PROTOCOLS', triggerEvent: 'progression.overdriveUnlocked', contextual: true,
    steps: [{ id: 'overdrive', target: 'garage.overdrive', title: 'OVERDRIVE UNLOCKED', body: 'Overdrive tiers let experienced operatives begin at later rounds. Each constellation tier has its own highest-round requirement.', mode: 'menu', completion: { type: 'auto', delayMs: 3400 } }]
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
