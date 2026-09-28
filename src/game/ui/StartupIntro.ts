/** Temporary title card until the authored animation is supplied. Set this to
 * 'assets/video/runtwerkxgaming-intro.mp4' when the final asset is installed. */
export const STARTUP_INTRO_VIDEO: string | null = null;

/** Boot owns this overlay; it stays above texture preparation until both the
 * intro and asset setup finish. No gameplay input or saved preferences change. */
export class StartupIntro {
  readonly ready: Promise<void>;
  private readonly root: HTMLDivElement;
  private readonly video: HTMLVideoElement | null;
  private readonly skip: HTMLButtonElement | null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private resolveReady!: () => void;
  private finished = false;
  private disposed = false;

  constructor(mount: HTMLElement, videoUrl: string | null = null) {
    this.ready = new Promise(resolve => { this.resolveReady = resolve; });
    this.root = document.createElement('div');
    this.root.className = 'startup-intro';
    this.root.setAttribute('aria-label', 'RuntWerkxGaming');
    const title = document.createElement('div');
    title.className = 'startup-intro-title';
    const name = document.createElement('strong');
    name.textContent = 'RuntWerkxGaming';
    const subtitle = document.createElement('span');
    subtitle.textContent = 'PRESENTS';
    title.append(name, subtitle);
    this.root.append(title);
    mount.append(this.root);

    if (!videoUrl) {
      this.video = null;
      this.skip = null;
      this.timer = setTimeout(this.finish, 1600);
      return;
    }
    this.video = document.createElement('video');
    this.video.className = 'startup-intro-video';
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.setAttribute('aria-label', 'RuntWerkxGaming introduction');
    this.video.addEventListener('playing', this.onPlaying, { once: true });
    this.video.addEventListener('ended', this.finish);
    this.video.addEventListener('error', this.onFailure);
    this.skip = document.createElement('button');
    this.skip.type = 'button';
    this.skip.className = 'startup-intro-skip';
    this.skip.textContent = 'SKIP INTRO';
    this.skip.addEventListener('click', this.finish);
    this.root.append(this.video, this.skip);
    this.timer = setTimeout(this.onFailure, 8000);
    this.video.src = videoUrl;
    void this.video.play().catch(this.onFailure);
  }

  private readonly onPlaying = (): void => {
    if (this.disposed || this.finished) return;
    this.root.classList.add('startup-intro-playing');
    clearTimeout(this.timer);
    // A broken/stalled optional video must never trap startup indefinitely.
    this.timer = setTimeout(this.finish, 45000);
  };

  private readonly onFailure = (): void => {
    if (this.disposed || this.finished) return;
    this.video?.pause();
    this.root.classList.remove('startup-intro-playing');
    clearTimeout(this.timer);
    this.timer = setTimeout(this.finish, 1600);
  };

  private readonly finish = (): void => {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timer);
    this.video?.pause();
    this.resolveReady();
  };

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.finish();
    this.skip?.removeEventListener('click', this.finish);
    if (this.video) {
      this.video.removeEventListener('playing', this.onPlaying);
      this.video.removeEventListener('ended', this.finish);
      this.video.removeEventListener('error', this.onFailure);
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.root.remove();
  }
}
