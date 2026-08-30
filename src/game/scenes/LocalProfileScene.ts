import Phaser from 'phaser';
import { SceneKeys } from '../flow/SceneKeys';
import { LocalSaveManager } from '../save/LocalSaveManager';
import { validateProfileName } from '../save/SaveValidator';
import { SaveSystem } from '../systems/SaveSystem';
import { getGameUiRoot } from '../../ui/getGameUiRoot';
import { LocalProfilesUi, type LocalProfilesUiHandle } from '../../ui/local-profiles/LocalProfilesUi';
import { downloadJsonFile, pickJsonFile, showConfirmDialog, showInfoDialog, showNameInputDialog, type DialogHandle } from '../../ui/local-profiles/ProfileDialogs';
import { ProfileArchiveBackdrop } from '../rendering/ProfileArchiveBackdrop.ts';

export class LocalProfileScene extends Phaser.Scene {
  private profileUi?: LocalProfilesUiHandle;
  private selectedProfileId: string | null = null;
  private activeDialog: DialogHandle | null = null;
  private archiveBackdrop: ProfileArchiveBackdrop | null = null;

  constructor() {
    super(SceneKeys.LocalProfiles);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x04070d);
    this.archiveBackdrop = new ProfileArchiveBackdrop(this);
    this.scale.on('resize', this.handleResize, this);
    this.mountUi();

    const legacy = LocalSaveManager.detectLegacyProgress();
    if (legacy.found && !legacy.prompted) {
      this.time.delayedCall(120, () => this.showLegacyPrompt());
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
  }

  private mountUi(): void {
    const profiles = LocalSaveManager.listProfiles();
    const activeProfileId = LocalSaveManager.getActiveProfileId();
    this.selectedProfileId = activeProfileId ?? profiles[0]?.id ?? null;

    this.profileUi?.destroy();
    this.profileUi = new LocalProfilesUi({
      root: getGameUiRoot(),
      profiles,
      activeProfileId,
      selectedProfileId: this.selectedProfileId,
      storageMessage: SaveSystem.getStorageMessage(),
      notice: SaveSystem.getNotice(),
      backupAvailability: LocalSaveManager.getProfilesBackupAvailability(),
      onSelect: (profileId) => {
        this.selectedProfileId = profileId;
        this.refreshUi();
      },
      onContinue: (profileId) => this.continueSelectedProfile(profileId),
      onCreate: () => this.openCreateProfileDialog(),
      onRename: (profileId) => this.openRenameProfileDialog(profileId),
      onExport: (profileId) => this.exportProfile(profileId),
      onImport: () => this.importProfile(),
      onDelete: (profileId) => this.deleteProfile(profileId),
      onLocalSaveInfo: () => this.openInfoDialog(
        'LOCAL SAVE INFORMATION',
        [
          'This game saves locally in your browser.',
          `Profiles stored: ${LocalSaveManager.listProfiles().length}`,
          LocalSaveManager.getActiveProfileSummary() ? `Active profile: ${LocalSaveManager.getActiveProfileSummary()?.name ?? 'Unknown'}` : 'No active profile is selected.',
          SaveSystem.getStorageMessage() ?? 'Browser storage is available.'
        ].join('\n\n')
      ),
      onRestoreBackup: (profileId) => this.restoreBackup(profileId)
    });
  }

  private refreshUi(): void {
    const profiles = LocalSaveManager.listProfiles();
    if (this.selectedProfileId && !profiles.some((profile) => profile.id === this.selectedProfileId)) {
      this.selectedProfileId = profiles[0]?.id ?? null;
    }

    this.profileUi?.update({
      profiles,
      activeProfileId: LocalSaveManager.getActiveProfileId(),
      selectedProfileId: this.selectedProfileId,
      storageMessage: SaveSystem.getStorageMessage(),
      notice: SaveSystem.getNotice(),
      backupAvailability: LocalSaveManager.getProfilesBackupAvailability()
    });
  }

  private openInfoDialog(title: string, body: string): void {
    this.closeActiveDialog();
    const handle = showInfoDialog({
      root: getGameUiRoot(),
      title,
      body,
      actions: [
        {
          label: 'CLOSE',
          primary: true,
          onClick: () => {
            this.activeDialog = null;
          }
        }
      ]
    });
    this.activeDialog = handle;
  }

  private openConfirmDialog(options: {
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
  }): void {
    this.closeActiveDialog();
    const handle = showConfirmDialog({
      root: getGameUiRoot(),
      title: options.title,
      body: options.body,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      danger: options.danger,
      onConfirm: () => {
        this.activeDialog = null;
        options.onConfirm();
      },
      onCancel: () => {
        this.activeDialog = null;
      }
    });
    this.activeDialog = handle;
  }

  private openCreateProfileDialog(): void {
    this.closeActiveDialog();
    const existingNames = LocalSaveManager.listProfiles().map((profile) => profile.name);
    const handle = showNameInputDialog({
      root: getGameUiRoot(),
      title: 'CREATE LOCAL PROFILE',
      body: 'This profile and its progress will be saved only in this browser.',
      label: 'Profile name',
      placeholder: 'Enter a profile name',
      initialValue: '',
      confirmLabel: 'CREATE PROFILE',
      cancelLabel: 'CANCEL',
      validate: (value) => validateProfileName(value, existingNames).error ?? null,
      onSubmit: (value) => {
        const result = SaveSystem.createProfile(value);
        if (!result.ok) {
          this.openInfoDialog('CREATE PROFILE FAILED', result.message ?? 'Could not create profile.');
          return;
        }
        this.selectedProfileId = SaveSystem.getActiveProfileSummary()?.id ?? LocalSaveManager.getActiveProfileId();
        // A newly-created operative proceeds directly into the profile-owned
        // first-run Main Menu welcome. Existing profile selection is unchanged.
        this.scene.start(SceneKeys.MainMenu, { showFirstRunWelcome: true });
      },
      onCancel: () => {
        this.activeDialog = null;
      }
    });
    this.activeDialog = handle;
  }

  private openRenameProfileDialog(profileId: string): void {
    const selected = LocalSaveManager.listProfiles().find((profile) => profile.id === profileId);
    if (!selected) return;

    this.closeActiveDialog();
    const existingNames = LocalSaveManager.listProfiles().filter((profile) => profile.id !== profileId).map((profile) => profile.name);
    const handle = showNameInputDialog({
      root: getGameUiRoot(),
      title: 'RENAME LOCAL PROFILE',
      body: 'Choose a new display name for this local profile.',
      label: 'Profile name',
      placeholder: 'Enter a new name',
      initialValue: selected.name,
      confirmLabel: 'SAVE NAME',
      cancelLabel: 'CANCEL',
      validate: (value) => validateProfileName(value, existingNames).error ?? null,
      onSubmit: (value) => {
        const result = SaveSystem.renameProfile(profileId, value);
        if (!result.ok) {
          this.openInfoDialog('RENAME FAILED', result.message ?? 'Could not rename profile.');
          return;
        }
        this.refreshUi();
      },
      onCancel: () => {
        this.activeDialog = null;
      }
    });
    this.activeDialog = handle;
  }

  private async importProfile(): Promise<void> {
    this.closeActiveDialog();
    const file = await pickJsonFile();
    if (!file) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text()) as unknown;
    } catch {
      this.openInfoDialog('IMPORT FAILED', 'The chosen file is not valid JSON.');
      return;
    }

    const preview = SaveSystem.previewImport(parsed);
    if (!preview.ok || !preview.preview) {
      this.openInfoDialog('IMPORT FAILED', preview.message ?? 'That file is not a valid N3ONDefense local save.');
      return;
    }

    this.openConfirmDialog({
      title: 'IMPORT SAVE',
      body: preview.preview.duplicateName
        ? `This save will be imported as “${preview.preview.suggestedName}” so it does not overwrite an existing profile.`
        : `Import “${preview.preview.suggestedName}” into this browser?`,
      confirmLabel: 'IMPORT SAVE',
      cancelLabel: 'CANCEL',
      onConfirm: () => {
        const result = SaveSystem.importProfile(parsed, 'new');
        if (!result.ok) {
          this.openInfoDialog('IMPORT FAILED', result.message ?? 'The save could not be imported.');
          return;
        }
        this.selectedProfileId = SaveSystem.getActiveProfileSummary()?.id ?? LocalSaveManager.getActiveProfileId();
        this.refreshUi();
      }
    });
  }

  private exportProfile(profileId: string): void {
    const result = SaveSystem.exportProfile(profileId);
    if (!result.ok || !result.file) {
      this.openInfoDialog('EXPORT FAILED', result.message ?? 'The save could not be exported.');
      return;
    }

    downloadJsonFile(result.file.save.profile.name, result.file);
    this.openInfoDialog('BACKUP EXPORTED', 'The selected profile backup has been exported to your downloads folder.');
  }

  private deleteProfile(profileId: string): void {
    const selected = LocalSaveManager.listProfiles().find((profile) => profile.id === profileId);
    if (!selected) return;

    this.openConfirmDialog({
      title: 'DELETE LOCAL PROFILE?',
      body: `Delete “${selected.name}” and its backup from this browser? This cannot be undone.`,
      confirmLabel: 'DELETE PROFILE',
      cancelLabel: 'CANCEL',
      danger: true,
      onConfirm: () => {
        const result = SaveSystem.deleteProfile(profileId);
        if (!result.ok) {
          this.openInfoDialog('DELETE FAILED', result.message ?? 'The profile could not be deleted.');
          return;
        }
        this.selectedProfileId = LocalSaveManager.getActiveProfileId();
        this.refreshUi();
      }
    });
  }

  private restoreBackup(profileId: string): void {
    const selected = LocalSaveManager.listProfiles().find((profile) => profile.id === profileId);
    if (!selected) return;

    this.openConfirmDialog({
      title: 'RESTORE BACKUP?',
      body: `Restore the backup for “${selected.name}” and overwrite the current local profile data?`,
      confirmLabel: 'RESTORE BACKUP',
      cancelLabel: 'CANCEL',
      danger: true,
      onConfirm: () => {
        const result = SaveSystem.restoreBackup(profileId);
        if (!result.ok) {
          this.openInfoDialog('RESTORE FAILED', result.message ?? 'No valid backup was found.');
          return;
        }
        this.refreshUi();
      }
    });
  }

  private continueSelectedProfile(profileId: string): void {
    const result = SaveSystem.selectProfile(profileId);
    if (!result.ok) {
      const recovery = LocalSaveManager.getRecoveryStatus();
      if (recovery?.profileId === profileId && recovery.hasValidBackup) {
        this.restoreBackup(profileId);
        return;
      }

      this.openInfoDialog('PROFILE UNAVAILABLE', result.message ?? 'The selected profile could not be loaded.');
      return;
    }

    this.selectedProfileId = profileId;
    this.refreshUi();
    this.scene.start(SceneKeys.MainMenu);
  }

  private showLegacyPrompt(): void {
    const legacy = LocalSaveManager.detectLegacyProgress();
    if (!legacy.found || legacy.prompted) return;

    this.openConfirmDialog({
      title: 'LEGACY SAVE FOUND',
      body: 'A legacy browser save was detected. Import it into the local profile system now?',
      confirmLabel: 'IMPORT LEGACY SAVE',
      cancelLabel: 'NOT NOW',
      onConfirm: () => {
        LocalSaveManager.recordLegacyPrompted();
        this.openLegacyImportDialog();
      }
    });
  }

  private openLegacyImportDialog(): void {
    this.closeActiveDialog();
    const existingNames = LocalSaveManager.listProfiles().map((profile) => profile.name);
    const handle = showNameInputDialog({
      root: getGameUiRoot(),
      title: 'IMPORT LEGACY SAVE',
      body: 'Choose a name for the imported legacy save.',
      label: 'Profile name',
      placeholder: 'Enter a profile name',
      initialValue: 'Legacy Profile',
      confirmLabel: 'IMPORT',
      cancelLabel: 'CANCEL',
      validate: (value) => validateProfileName(value, existingNames).error ?? null,
      onSubmit: (value) => {
        const result = SaveSystem.createProfileFromLegacy(value);
        if (!result.ok) {
          this.openInfoDialog('IMPORT FAILED', result.message ?? 'The legacy save could not be imported.');
          return;
        }
        this.selectedProfileId = SaveSystem.getActiveProfileSummary()?.id ?? LocalSaveManager.getActiveProfileId();
        this.refreshUi();
      },
      onCancel: () => {
        this.activeDialog = null;
      }
    });
    this.activeDialog = handle;
  }

  private closeActiveDialog(): void {
    this.activeDialog?.destroy();
    this.activeDialog = null;
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.archiveBackdrop?.resize(gameSize.width, gameSize.height);
  };

  private shutdown(): void {
    this.scale.off('resize', this.handleResize, this);
    this.archiveBackdrop?.destroy();
    this.archiveBackdrop = null;
    this.closeActiveDialog();
    this.profileUi?.destroy();
    this.profileUi = undefined;
  }
}
