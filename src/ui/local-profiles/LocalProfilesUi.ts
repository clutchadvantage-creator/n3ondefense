import type { ProfileSummary } from '../../game/save/LocalSaveTypes';
import { createProfileCard, formatProfileDate, getProfileAvatarColor } from './ProfileCard';
import './local-profiles.css';

export interface LocalProfilesUiOptions {
  root: HTMLElement;
  profiles: ProfileSummary[];
  activeProfileId: string | null;
  selectedProfileId?: string | null;
  storageMessage?: string | null;
  notice?: string | null;
  backupAvailability?: Record<string, boolean>;

  onSelect(profileId: string): void;
  onContinue(profileId: string): void;
  onCreate(): void;
  onRename(profileId: string): void;
  onExport(profileId: string): void;
  onImport(): void;
  onDelete(profileId: string): void;
  onLocalSaveInfo(): void;
  onRestoreBackup?(profileId: string): void;
}

export interface LocalProfilesUiHandle {
  update(update: Partial<LocalProfilesUiState>): void;
  destroy(): void;
}

interface LocalProfilesUiState {
  profiles: ProfileSummary[];
  activeProfileId: string | null;
  selectedProfileId: string | null;
  storageMessage: string | null;
  notice: string | null;
  backupAvailability: Record<string, boolean>;
}

export class LocalProfilesUi implements LocalProfilesUiHandle {
  private readonly root: HTMLElement;
  private readonly callbacks: Omit<LocalProfilesUiOptions, 'root' | 'profiles' | 'activeProfileId' | 'selectedProfileId' | 'storageMessage' | 'notice' | 'backupAvailability'>;
  private state: LocalProfilesUiState;
  private screen: HTMLElement | null = null;

  constructor(options: LocalProfilesUiOptions) {
    this.root = options.root;
    this.callbacks = {
      onSelect: options.onSelect,
      onContinue: options.onContinue,
      onCreate: options.onCreate,
      onRename: options.onRename,
      onExport: options.onExport,
      onImport: options.onImport,
      onDelete: options.onDelete,
      onLocalSaveInfo: options.onLocalSaveInfo,
      onRestoreBackup: options.onRestoreBackup
    };
    this.state = {
      profiles: options.profiles,
      activeProfileId: options.activeProfileId,
      selectedProfileId: options.selectedProfileId ?? options.activeProfileId ?? options.profiles[0]?.id ?? null,
      storageMessage: options.storageMessage ?? null,
      notice: options.notice ?? null,
      backupAvailability: options.backupAvailability ?? {}
    };

    // The game UI mount is shared by scene-owned interfaces and transient
    // overlays. Only remove a stale profiles screen here; clearing the entire
    // mount can erase UI created by the incoming scene during a transition.
    this.root.querySelector<HTMLElement>('#local-profiles-ui')?.remove();
    this.render();
  }

  update(update: Partial<LocalProfilesUiState>): void {
    this.state = { ...this.state, ...update };
    if (this.state.selectedProfileId && !this.state.profiles.some((profile) => profile.id === this.state.selectedProfileId)) {
      this.state.selectedProfileId = this.state.profiles[0]?.id ?? null;
    }
    this.render();
  }

  destroy(): void {
    this.screen?.remove();
    this.screen = null;
  }

  private render(): void {
    this.screen?.remove();

    const screen = document.createElement('div');
    screen.id = 'local-profiles-ui';
    screen.className = 'local-profiles-screen';

    const shell = document.createElement('main');
    shell.className = 'local-profiles-shell';

    const shellChrome = document.createElement('div');
    shellChrome.className = 'local-profiles-shell-chrome';
    shellChrome.setAttribute('aria-hidden', 'true');
    shellChrome.append(
      this.createChromeRail('chrome-rail top'),
      this.createChromeRail('chrome-rail left'),
      this.createChromeRail('chrome-rail right')
    );

    const header = document.createElement('header');
    header.className = 'local-profiles-header';

    const statusLine = document.createElement('div');
    statusLine.className = 'local-profiles-status-line';
    const vaultStatus = document.createElement('span');
    vaultStatus.textContent = 'N3ON IDENTITY // LOCAL VAULT';
    const linkStatus = document.createElement('span');
    linkStatus.className = 'linked';
    linkStatus.textContent = 'PROFILE LINK // SYNCED';
    statusLine.append(vaultStatus, linkStatus);

    const title = document.createElement('h1');
    title.textContent = 'LOCAL PROFILES';
    title.dataset.title = title.textContent;

    const kicker = document.createElement('p');
    kicker.className = 'local-profiles-kicker';
    kicker.textContent = 'OPERATIVE ARCHIVE // LOCAL IDENTITY CONTROL';

    const description = document.createElement('p');
    description.className = 'local-profiles-description';
    description.textContent = 'Progress is saved only in this browser. Export a backup before clearing browser data or changing devices.';

    header.append(statusLine, title, kicker, description);
    shell.append(shellChrome);

    if (this.state.profiles.length === 0) {
      shell.append(header, this.renderEmptyState());
    } else {
      const grid = document.createElement('section');
      grid.className = 'local-profiles-grid';
      grid.append(this.renderProfilesPanel(), this.renderSelectedProfilePanel());
      shell.append(header, grid);
    }

    const footer = document.createElement('footer');
    footer.className = 'local-save-footer';

    const badge = document.createElement('span');
    badge.textContent = 'N3ON IDENTITY // LOCAL BROWSER SAVE';

    const status = this.state.storageMessage
      ? document.createElement('span')
      : null;
    if (status) {
      status.className = 'local-save-footer-message';
      status.textContent = this.state.storageMessage;
    }

    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'profile-button secondary';
    info.textContent = 'LOCAL SAVE INFORMATION';
    info.addEventListener('click', () => this.callbacks.onLocalSaveInfo());

    footer.append(badge);
    if (status) footer.append(status);
    footer.append(info);
    shell.append(footer);

    screen.append(shell);
    this.root.append(screen);
    this.screen = screen;
  }

  private renderEmptyState(): HTMLElement {
    const empty = document.createElement('section');
    empty.className = 'profiles-empty-state';

    const heading = document.createElement('h2');
    heading.textContent = 'NO LOCAL PROFILES FOUND';

    const copy = document.createElement('p');
    copy.textContent = 'Create a local profile or import a previously exported save.';

    const actions = document.createElement('div');
    actions.className = 'profiles-empty-actions';

    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'profile-button primary';
    create.textContent = 'CREATE LOCAL PROFILE';
    create.addEventListener('click', () => this.callbacks.onCreate());

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'profile-button secondary';
    importButton.textContent = 'IMPORT SAVE';
    importButton.addEventListener('click', () => this.callbacks.onImport());

    actions.append(create, importButton);
    empty.append(heading, copy, actions);
    return empty;
  }

  private renderProfilesPanel(): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'profiles-panel';

    const heading = document.createElement('div');
    heading.className = 'panel-heading';

    const title = document.createElement('h2');
    title.textContent = 'PROFILE ARCHIVE // YOUR PROFILES';

    const count = document.createElement('span');
    count.textContent = `${this.state.profiles.length} LOCAL PROFILE${this.state.profiles.length === 1 ? '' : 'S'}`;

    heading.append(title, count);

    const listContainer = document.createElement('div');
    listContainer.className = 'profile-list';

    for (const profile of this.state.profiles) {
      const selected = profile.id === this.state.selectedProfileId;
      const active = profile.id === this.state.activeProfileId;
      listContainer.append(createProfileCard({
        profile,
        selected,
        active,
        onSelect: (profileId) => {
          this.callbacks.onSelect(profileId);
        }
      }));
    }

    const actions = document.createElement('div');
    actions.className = 'profiles-panel-actions';

    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'profile-button primary';
    create.textContent = 'CREATE NEW PROFILE';
    create.addEventListener('click', () => this.callbacks.onCreate());

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'profile-button secondary';
    importButton.textContent = 'IMPORT SAVE';
    importButton.addEventListener('click', () => this.callbacks.onImport());

    actions.append(create, importButton);
    panel.append(heading, listContainer, actions);
    return panel;
  }

  private renderSelectedProfilePanel(): HTMLElement {
    const panel = document.createElement('aside');
    panel.className = 'selected-profile-panel';

    const selected = this.state.profiles.find((profile) => profile.id === this.state.selectedProfileId) ?? this.state.profiles[0];
    if (!selected) {
      return panel;
    }

    const heading = document.createElement('h2');
    heading.textContent = 'SELECTED OPERATIVE // PROFILE LINK';

    const top = document.createElement('div');
    top.className = 'selected-profile-top';

    const avatar = document.createElement('div');
    avatar.className = 'selected-profile-avatar';
    avatar.style.setProperty('--avatar-color', getProfileAvatarColor(selected));

    const nameBlock = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = selected.name;
    const status = document.createElement('p');
    status.textContent = `Last played ${formatProfileDate(selected.lastPlayedAt)}`;
    nameBlock.append(name, status);
    top.append(avatar, nameBlock);

    const stats = document.createElement('dl');
    stats.className = 'selected-profile-stat-grid';
    stats.append(
      this.createStat('Credits', selected.credits.toLocaleString()),
      this.createStat('Core Tokens', selected.coreTokens.toLocaleString()),
      this.createStat('Highest Round', selected.highestRound.toLocaleString()),
      this.createStat('Rounds Completed', selected.roundsCompleted.toLocaleString())
    );

    const actionList = document.createElement('div');
    actionList.className = 'profile-action-list';

    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'profile-button primary';
    continueButton.textContent = 'CONTINUE';
    continueButton.addEventListener('click', () => this.callbacks.onContinue(selected.id));

    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.className = 'profile-button secondary';
    renameButton.textContent = 'RENAME';
    renameButton.addEventListener('click', () => this.callbacks.onRename(selected.id));

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'profile-button secondary';
    exportButton.textContent = 'EXPORT SAVE';
    exportButton.addEventListener('click', () => this.callbacks.onExport(selected.id));

    actionList.append(continueButton, renameButton, exportButton);

    const backupAvailable = this.state.backupAvailability[selected.id];
    if (backupAvailable && this.callbacks.onRestoreBackup) {
      const restoreButton = document.createElement('button');
      restoreButton.type = 'button';
      restoreButton.className = 'profile-button secondary';
      restoreButton.textContent = 'RESTORE BACKUP';
      restoreButton.addEventListener('click', () => this.callbacks.onRestoreBackup?.(selected.id));
      actionList.append(restoreButton);
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'profile-button danger';
    deleteButton.textContent = 'DELETE PROFILE';
    deleteButton.addEventListener('click', () => this.callbacks.onDelete(selected.id));

    const note = document.createElement('p');
    note.className = 'selected-profile-note';
    note.textContent = this.state.notice ?? 'Select a profile to manage it.';

    panel.append(heading, top, stats, actionList, deleteButton, note);
    return panel;
  }

  private createStat(label: string, value: string): HTMLDivElement {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    wrapper.append(term, description);
    return wrapper;
  }

  private createChromeRail(className: string): HTMLSpanElement {
    const rail = document.createElement('span');
    rail.className = className;
    return rail;
  }
}
