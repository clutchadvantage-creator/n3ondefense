/** Authored studio intro. Missing or failed media proceeds directly to the splash. */
export const STARTUP_INTRO_VIDEO: string | null = 'assets/video/runtwerkxgaming-intro.mp4';
export const STARTUP_INTRO_DURATION_MS = 4500;

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
    mount.append(this.root);

    if (!videoUrl) {
      this.video = null;
      this.skip = null;
      this.finish();
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
    // Start the cutoff when playback begins, not while the file is loading.
    // Skip the video's tail and hand directly back to Boot's splash transition.
    this.timer = setTimeout(this.finish, STARTUP_INTRO_DURATION_MS);
  };

  private readonly onFailure = (): void => {
    if (this.disposed || this.finished) return;
    this.root.classList.remove('startup-intro-playing');
    this.finish();
  };

  private readonly finish = (): void => {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timer);
    this.video?.pause();
    if (this.skip) this.skip.hidden = true;
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
