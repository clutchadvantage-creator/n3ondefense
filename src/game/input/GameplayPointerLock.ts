import Phaser from 'phaser';

interface PointerLockCallbacks {
  onLocked: () => void;
  onLost: (reason: 'unlock' | 'blur' | 'hidden' | 'error') => void;
}

export class GameplayPointerLock {
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLButtonElement;
  private aimX: number;
  private aimY: number;
  private disposed = false;
  private wasLocked = false;

  constructor(private readonly game: Phaser.Game, private readonly callbacks: PointerLockCallbacks) {
    this.canvas = game.canvas;
    const rect = this.canvas.getBoundingClientRect();
    this.aimX = rect.width * 0.5;
    this.aimY = rect.height * 0.5;
    this.overlay = document.createElement('button');
    this.overlay.type = 'button';
    this.overlay.className = 'gameplay-pointer-lock';
    this.overlay.addEventListener('click', this.request);
    document.querySelector('#game-root')?.append(this.overlay);
    document.addEventListener('pointerlockchange', this.handleChange);
    document.addEventListener('pointerlockerror', this.handleError);
    document.addEventListener('mousemove', this.handleMove);
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('blur', this.handleBlur);
    this.canvas.addEventListener('contextmenu', this.preventCanvasDefault);
    this.canvas.addEventListener('dragstart', this.preventCanvasDefault);
    this.canvas.classList.add('gameplay-canvas');
  }

  get locked(): boolean { return document.pointerLockElement === this.canvas; }
  get supported(): boolean { return typeof this.canvas.requestPointerLock === 'function'; }

  showInitial(): void {
    this.show(this.supported ? 'CLICK TO PLAY' : 'POINTER LOCK UNAVAILABLE', this.supported
      ? 'Mouse is captured during gameplay. Press Esc to pause.'
      : 'Use a current Firefox, Chrome, or Edge browser to play with mouse capture.');
    this.overlay.disabled = !this.supported;
  }

  showResume(message = 'CLICK TO RESUME'): void {
    this.show(message, 'Mouse capture is paused. Click to return to the operation.');
    this.overlay.disabled = !this.supported;
  }

  hidePrompt(): void { this.overlay.hidden = true; }

  requestLock(): void { this.request(); }

  release(): void {
    this.wasLocked = false;
    if (this.locked) void document.exitPointerLock();
  }

  worldPoint(camera: Phaser.Cameras.Scene2D.Camera): Phaser.Math.Vector2 {
    const point = this.screenPoint();
    return camera.getWorldPoint(point.x, point.y);
  }

  screenPoint(): Phaser.Math.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    const x = rect.width > 0 ? this.aimX * (this.game.scale.width / rect.width) : this.game.scale.width * 0.5;
    const y = rect.height > 0 ? this.aimY * (this.game.scale.height / rect.height) : this.game.scale.height * 0.5;
    return new Phaser.Math.Vector2(x, y);
  }

  destroy(): void {
    this.disposed = true;
    this.release();
    this.overlay.removeEventListener('click', this.request);
    this.overlay.remove();
    document.removeEventListener('pointerlockchange', this.handleChange);
    document.removeEventListener('pointerlockerror', this.handleError);
    document.removeEventListener('mousemove', this.handleMove);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
    this.canvas.removeEventListener('contextmenu', this.preventCanvasDefault);
    this.canvas.removeEventListener('dragstart', this.preventCanvasDefault);
    this.canvas.classList.remove('gameplay-canvas');
  }

  private readonly request = (): void => {
    if (this.disposed || !this.supported || this.locked) return;
    const result = this.canvas.requestPointerLock();
    if (result && typeof result.catch === 'function') result.catch(() => this.handleError());
  };

  private readonly handleChange = (): void => {
    if (this.disposed) return;
    if (this.locked) {
      this.wasLocked = true;
      this.overlay.hidden = true;
      this.callbacks.onLocked();
    } else if (this.wasLocked) {
      this.wasLocked = false;
      this.showResume();
      this.callbacks.onLost('unlock');
    }
  };

  private readonly handleMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    const rect = this.canvas.getBoundingClientRect();
    this.aimX = Math.max(0, Math.min(rect.width, this.aimX + event.movementX));
    this.aimY = Math.max(0, Math.min(rect.height, this.aimY + event.movementY));
  };

  private readonly handleError = (): void => {
    if (this.disposed) return;
    this.wasLocked = false;
    this.showResume('MOUSE CAPTURE FAILED — CLICK TO RETRY');
    this.callbacks.onLost('error');
  };

  private readonly handleBlur = (): void => {
    if (this.disposed) return;
    this.wasLocked = false;
    if (this.locked) void document.exitPointerLock();
    this.showResume();
    this.callbacks.onLost('blur');
  };

  private readonly handleVisibility = (): void => {
    if (!document.hidden || this.disposed) return;
    this.wasLocked = false;
    if (this.locked) void document.exitPointerLock();
    this.callbacks.onLost('hidden');
  };

  private readonly preventCanvasDefault = (event: Event): void => event.preventDefault();

  private show(title: string, detail: string): void {
    this.overlay.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
    this.overlay.hidden = false;
  }
}
