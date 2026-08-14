import Phaser from 'phaser';
import { OnlineRunManager } from '../../online/OnlineRunManager';
import { RunTransitionManager } from '../flow/RunTransitionManager';
import { SceneKeys } from '../flow/SceneKeys';
import { RUN_PROTOCOLS, normalizeRunProtocolId } from '../mods/modBalance.ts';
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

    createDebriefShell(this, layout, 'complete', 'ROUND FINISHED', `ROUND ${completedRound} // OPERATION COMPLETE`);
    createRewardSummary(this, sections.rewards, [
      { kind: 'credits', value: payload?.creditsGained ?? 0 },
      { kind: 'coreTokens', value: payload?.coreTokensGained ?? 0 },
      { kind: 'plasmaChips', value: payload?.plasmaChipsGained ?? 0 },
      { kind: 'fluxCores', value: payload?.fluxCoresGained ?? 0 }
    ], layout.compact);

    const operationFields = [
      { label: 'PROTOCOL', value: protocolDefinition.label.toUpperCase() },
      { label: 'CONTRACT', value: displayId(payload?.contract) },
      { label: 'SIGNAL', value: displayId(payload?.modFocus) },
      { label: 'MODS ACQUIRED', value: String(payload?.modsEarned.length ?? 0) },
      { label: 'LAYOUT', value: displayId(payload?.completedTemplate) },
      { label: 'COMPLETED SEED', value: String(payload?.completedSeed ?? '-') }
    ];
    if (payload?.bossDefeated) operationFields.push({ label: 'BOSS DEFEATED', value: displayId(payload.bossDefeated) });
    createOperationReadout(this, sections.operation, operationFields, layout.compact);

    createDebriefHighlight(this, sections.highlight, {
      eyebrow: 'NEXT DEPLOYMENT // ARENA PREVIEW',
      primary: `ROUND ${payload?.nextRound ?? '-'}`,
      details: [`LAYOUT ${displayId(payload?.nextTemplate)}`, `SEED ${payload?.nextSeed ?? '-'}`],
      tone: 'complete'
    }, layout.compact);

    let continueButton!: Phaser.GameObjects.Container;
    const actions = createDebriefActions(this, layout.actions, [
      {
        label: 'CONTINUE TO NEXT ROUND',
        primary: true,
        onClick: () => {
          disableButton(continueButton);
          if (!payload) {
            startArenaLoad(this, { reason: 'continue-next-round', message: 'Building next arena...' });
            return;
          }
          const session: ArenaSessionState = {
            baseSeed: payload.baseSeed,
            round: payload.nextRound,
            objectiveMode: payload.objectiveMode,
            protocol: payload.protocol,
            runStartedAt: payload.runStartedAt,
            equippedMods: payload.equippedMods,
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
    ], layout.compact, 'ENDLESS FLOW // NEXT ARENA READY');
    continueButton = actions.get('CONTINUE TO NEXT ROUND')!;

    this.scale.off('resize', this.handleResize, this);
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.handleResize, this));
  }
}
