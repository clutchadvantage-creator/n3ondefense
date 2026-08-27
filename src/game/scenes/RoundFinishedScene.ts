import Phaser from 'phaser';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import { RUN_PROTOCOLS, normalizeRunProtocolId } from '../mods/modBalance.ts';
import { ModRuntime } from '../mods/ModRuntime.ts';
import { SaveSystem } from '../systems/SaveSystem.ts';
import { GameplayTelemetryRecorder } from '../telemetry/GameplayTelemetryRecorder.ts';
import type { ArenaSessionState, RoundFinishedPayload } from '../types';
import { calculateDebriefLayout, splitDebriefPrimary } from '../ui/DebriefLayout.ts';
import {
  createDebriefActions,
  createDebriefHighlight,
  createDebriefShell,
  createOperationReadout,
  createRewardSummary
} from '../ui/DebriefUi.ts';
import type { DebriefAction } from '../ui/DebriefUi.ts';
import { startArenaLoad } from '../utils/runFlow';
import { disableButton } from '../utils/ui';

const displayId = (value: string | null | undefined): string => value
  ? value.replace(/([A-Z])/g, ' $1').replace(/-/g, ' ').trim().toUpperCase()
  : 'NONE';

export class RoundFinishedScene extends Phaser.Scene {
  private readonly handleResize = (): void => { this.scene.restart(); };

  constructor() {
    super(SceneKeys.RoundFinished);
  }

  create(): void {
    const payload = this.registry.get('round-finished') as RoundFinishedPayload | undefined;
    const protocolDefinition = RUN_PROTOCOLS[normalizeRunProtocolId(payload?.protocol)];
    const { width, height } = this.scale;
    const layout = calculateDebriefLayout(width, height);
    const sections = splitDebriefPrimary(layout.primary, layout.compact);
    const completedRound = payload?.completedRound ?? '-';
    const supremeCompletion = payload?.supremeCompletion === true;

    createDebriefShell(
      this,
      layout,
      'complete',
      supremeCompletion ? 'SUPREME OVERDRIVE COMPLETE' : 'ROUND FINISHED',
      supremeCompletion ? 'TERMINAL OVERRIDE DESTROYED // FINAL PROTOCOL CLEARED' : `ROUND ${completedRound} // OPERATION COMPLETE`,
      true
    );
    createRewardSummary(this, sections.rewards, [
      { kind: 'credits', value: payload?.creditsGained ?? 0 },
      { kind: 'coreTokens', value: payload?.coreTokensGained ?? 0 },
      { kind: 'plasmaChips', value: payload?.plasmaChipsGained ?? 0 },
      { kind: 'fluxCores', value: payload?.fluxCoresGained ?? 0 }
    ], layout.compact, false, true);

    const operationFields = [
      { label: 'PROTOCOL', value: protocolDefinition.label.toUpperCase() },
      { label: 'CONTRACT', value: displayId(payload?.contract) },
      { label: 'SIGNAL', value: displayId(payload?.modFocus) },
      { label: 'MODS ACQUIRED', value: String(payload?.modsEarned.length ?? 0) },
      { label: 'LAYOUT', value: displayId(payload?.completedTemplate) },
      { label: 'COMPLETED SEED', value: String(payload?.completedSeed ?? '-') }
    ];
    if (payload?.bossDefeated) operationFields.push({ label: 'BOSS DEFEATED', value: displayId(payload.bossDefeated) });
    if (supremeCompletion) operationFields.push({ label: 'COMMAND BOSSES', value: `${payload?.terminalBossesDefeated ?? 3} / 3 DESTROYED` });
    createOperationReadout(this, sections.operation, operationFields, layout.compact, true);

    createDebriefHighlight(this, sections.highlight, {
      eyebrow: supremeCompletion
        ? 'SUPREME PROTOCOL // OFFICIAL COMPLETION'
        : payload?.supremeOverdriveUnlocked
          ? 'SUPREME OVERDRIVE // PROTOCOL UNLOCKED'
          : 'NEXT DEPLOYMENT // ARENA PREVIEW',
      primary: supremeCompletion ? 'LEVEL 100 CLEARED' : `ROUND ${payload?.nextRound ?? '-'}`,
      details: supremeCompletion
        ? ['ALL THREE COMMAND BOSSES ELIMINATED', 'COMPLETION FLAG SAVED TO OPERATIVE PROFILE']
        : payload?.supremeOverdriveUnlocked
          ? ['OVERDRIVE LEO // LEVEL 51', 'SUPREME MODS MAY NOW BE EQUIPPED']
          : [`LAYOUT ${displayId(payload?.nextTemplate)}`, `SEED ${payload?.nextSeed ?? '-'}`],
      tone: 'complete'
    }, layout.compact, true);

    let continueButton: Phaser.GameObjects.Container | undefined;
    const exitRun = (destination: 'garage' | 'menu'): void => {
      OnlineRunManager.complete('victory', payload?.completedRound);
      GameplayTelemetryRecorder.finishRun('bossDefeated');
      this.registry.remove('arena-session');
      RunTransitionManager.clearForMenu(this);
      this.scene.start(destination === 'garage' ? SceneKeys.Garage : SceneKeys.MainMenu);
    };
    const standardActions: DebriefAction[] = [
      {
        label: 'CONTINUE TO NEXT ROUND',
        primary: true,
        onClick: () => {
          if (continueButton) disableButton(continueButton);
          if (!payload) {
            startArenaLoad(this, { reason: 'continue-next-round', message: 'Building next arena...' });
            return;
          }
          const nextProtocol = payload.nextProtocol ?? payload.protocol;
          const equippedMods = nextProtocol === payload.protocol
            ? payload.equippedMods
            : new ModRuntime(SaveSystem.getModCollection(), undefined, nextProtocol).snapshot();
          const session: ArenaSessionState = {
            baseSeed: payload.baseSeed,
            round: payload.nextRound,
            objectiveMode: payload.objectiveMode,
            protocol: nextProtocol,
            runStartedAt: payload.runStartedAt,
            equippedMods,
            modsEarned: payload.modsEarned,
            modFocus: payload.modFocus,
            contract: payload.contract,
            creditsSpentBeforeRun: payload.creditsSpentBeforeRun,
            upgradeCompletionPercentage: payload.upgradeCompletionPercentage,
            accountProgressionTier: payload.accountProgressionTier,
            runCreditsEarned: payload.runCreditsEarned
          };
          startArenaLoad(this, { reason: 'continue-next-round', session, message: 'Deploying next round arena...' });
        }
      },
      {
        label: 'STORE',
        onClick: () => this.scene.start(SceneKeys.Upgrades, { returnScene: SceneKeys.RoundFinished, resumePausedScene: false })
      },
      {
        label: 'MOD COLLECTION',
        onClick: () => this.scene.start(SceneKeys.Mods, { returnScene: SceneKeys.RoundFinished })
      },
      {
        label: 'EXPORT GAMEPLAY METRICS',
        onClick: () => GameplayTelemetryRecorder.exportToJsonFile()
      },
      {
        label: 'QUIT TO MAIN MENU',
        warning: true,
        onClick: () => {
          OnlineRunManager.complete('quit', payload?.completedRound);
          GameplayTelemetryRecorder.finishRun('quit');
          this.registry.remove('arena-session');
          RunTransitionManager.clearForMenu(this);
          this.scene.start(SceneKeys.MainMenu);
        }
      }
    ];
    const supremeActions: DebriefAction[] = [
      { label: 'RETURN TO OPERATOR GARAGE', primary: true, onClick: () => exitRun('garage') },
      { label: 'MOD COLLECTION', onClick: () => this.scene.start(SceneKeys.Mods, { returnScene: SceneKeys.RoundFinished }) },
      { label: 'EXPORT GAMEPLAY METRICS', onClick: () => GameplayTelemetryRecorder.exportToJsonFile() },
      { label: 'RETURN TO MAIN MENU', warning: true, onClick: () => exitRun('menu') }
    ];
    const actions = createDebriefActions(
      this,
      layout.actions,
      supremeCompletion ? supremeActions : standardActions,
      layout.compact,
      supremeCompletion ? 'SUPREME CLEAR PERSISTED // THE CONSTELLATION ENDURES' : 'ENDLESS FLOW // NEXT ARENA READY',
      true
    );
    continueButton = actions.get('CONTINUE TO NEXT ROUND');

    this.scale.off('resize', this.handleResize, this);
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.handleResize, this));
  }
}
