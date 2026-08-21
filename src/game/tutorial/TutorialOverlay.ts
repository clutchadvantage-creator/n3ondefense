import type { TutorialStepDefinition, TutorialTargetBounds } from './TutorialTypes.ts';
import { projectViewportBoundsToTutorialMount, resolveTutorialCalloutPlacement } from './TutorialTargeting.ts';

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  element.className = className;
  return element;
};

export class TutorialOverlay {
  private readonly mount: HTMLElement;
  private readonly root = make('section', 'tutorial-overlay');
  private readonly shadeTop = make('div', 'tutorial-shade tutorial-shade-top');
  private readonly shadeRight = make('div', 'tutorial-shade tutorial-shade-right');
  private readonly shadeBottom = make('div', 'tutorial-shade tutorial-shade-bottom');
  private readonly shadeLeft = make('div', 'tutorial-shade tutorial-shade-left');
  private readonly focus = make('div', 'tutorial-focus');
  private readonly arrow = make('div', 'tutorial-arrow');
  private readonly callout = make('article', 'tutorial-callout');
  private readonly eyebrow = make('div', 'tutorial-eyebrow');
  private readonly title = make('h2', 'tutorial-title');
  private readonly body = make('p', 'tutorial-body');
  private readonly illustration = make('div', 'tutorial-illustration');
  private readonly keys = make('div', 'tutorial-input-demo');
  private readonly progress = make('div', 'tutorial-progress');
  private readonly skip = make('button', 'tutorial-skip');
  private readonly continueButton = make('button', 'tutorial-continue');
  private targetResolver: (() => TutorialTargetBounds | null) | null = null;
  private frame = 0;
  private manualHandler: (() => void) | null = null;
  private targetPadding = 12;
  private readonly consumePointerEvent = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  constructor(onSkip: () => void, arenaPresentation = false) {
    const mount = document.querySelector<HTMLElement>('#game-ui-root');
    if (!mount) throw new Error('Tutorial overlay requires #game-ui-root.');
    this.mount = mount;
    this.root.classList.toggle('tutorial-overlay--arena', arenaPresentation);
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'polite');
    this.skip.type = 'button';
    this.skip.textContent = 'SKIP TUTORIAL  [K]';
    for (const type of ['pointerdown', 'pointerup'] as const) {
      this.callout.addEventListener(type, this.consumePointerEvent);
      this.skip.addEventListener(type, this.consumePointerEvent);
    }
    this.skip.addEventListener('click', (event) => {
      this.consumePointerEvent(event);
      onSkip();
    });
    this.continueButton.type = 'button';
    this.continueButton.textContent = 'CONTINUE';
    this.continueButton.addEventListener('click', (event) => {
      // Consume the complete click before advancing or navigating. At common
      // viewport sizes this control overlaps the Phaser Store button beneath
      // it, so allowing the event to bubble causes an unintended Store launch.
      this.consumePointerEvent(event);
      this.manualHandler?.();
    });
    this.callout.append(this.eyebrow, this.title, this.body, this.illustration, this.keys, this.progress, this.continueButton);
    this.root.append(this.shadeTop, this.shadeRight, this.shadeBottom, this.shadeLeft, this.focus, this.arrow, this.callout, this.skip);
    for (const shade of [this.shadeTop, this.shadeRight, this.shadeBottom, this.shadeLeft]) {
      shade.addEventListener('pointerdown', this.consumePointerEvent);
      shade.addEventListener('pointerup', this.consumePointerEvent);
      shade.addEventListener('click', this.consumePointerEvent);
    }
    mount.append(this.root);
  }

  show(
    step: TutorialStepDefinition,
    index: number,
    total: number,
    targetResolver: () => TutorialTargetBounds | null,
    onManual: () => void,
    skippable: boolean,
    manualAdvanceLabel: string | null
  ): void {
    this.root.hidden = false;
    this.root.classList.remove('tutorial-confirm');
    this.targetResolver = targetResolver;
    this.manualHandler = onManual;
    this.eyebrow.textContent = step.eyebrow ?? 'N3ON PROTOCOL // GUIDANCE';
    this.title.textContent = step.title;
    this.body.textContent = step.body;
    this.illustration.textContent = step.illustration ?? '';
    this.illustration.hidden = !step.illustration;
    this.targetPadding = step.targetPadding ?? 12;
    this.progress.textContent = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    this.keys.replaceChildren(...(step.inputDemo ?? []).map((label) => {
      const chip = make('span', label === 'MOUSE' ? 'tutorial-mouse' : 'tutorial-key');
      chip.textContent = label;
      return chip;
    }));
    this.keys.hidden = !step.inputDemo?.length;
    this.continueButton.hidden = manualAdvanceLabel === null;
    this.continueButton.textContent = manualAdvanceLabel ?? 'CONTINUE';
    this.skip.hidden = !skippable;
    this.focus.classList.toggle('tutorial-focus-circle', step.spotlight === 'circle');
    cancelAnimationFrame(this.frame);
    const follow = (): void => {
      this.layout(this.targetResolver?.() ?? null);
      this.frame = requestAnimationFrame(follow);
    };
    follow();
  }

  confirm(): void {
    this.root.classList.remove('tutorial-confirm');
    void this.root.offsetWidth;
    this.root.classList.add('tutorial-confirm');
  }

  hide(): void {
    cancelAnimationFrame(this.frame);
    this.root.hidden = true;
    this.targetResolver = null;
    this.manualHandler = null;
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.root.remove();
  }

  private layout(target: TutorialTargetBounds | null): void {
    const mountBounds = this.mount.getBoundingClientRect();
    const viewportWidth = this.mount.clientWidth || mountBounds.width;
    const viewportHeight = this.mount.clientHeight || mountBounds.height;
    const localTarget = target
      ? projectViewportBoundsToTutorialMount(target, mountBounds, viewportWidth, viewportHeight)
      : null;
    this.root.classList.toggle('tutorial-no-target', !localTarget);
    if (!localTarget) {
      this.callout.style.left = `${viewportWidth / 2}px`;
      this.callout.style.top = `${viewportHeight / 2}px`;
      this.callout.dataset.position = 'center';
      return;
    }
    const pad = this.targetPadding;
    const x = Math.max(8, localTarget.x - pad);
    const y = Math.max(8, localTarget.y - pad);
    const right = Math.min(viewportWidth - 8, localTarget.x + localTarget.width + pad);
    const bottom = Math.min(viewportHeight - 8, localTarget.y + localTarget.height + pad);
    const width = Math.max(24, right - x);
    const height = Math.max(24, bottom - y);
    Object.assign(this.focus.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
    Object.assign(this.shadeTop.style, { left: '0px', top: '0px', width: '100%', height: `${y}px` });
    Object.assign(this.shadeBottom.style, { left: '0px', top: `${bottom}px`, width: '100%', height: `${Math.max(0, viewportHeight - bottom)}px` });
    Object.assign(this.shadeLeft.style, { left: '0px', top: `${y}px`, width: `${x}px`, height: `${height}px` });
    Object.assign(this.shadeRight.style, { left: `${right}px`, top: `${y}px`, width: `${Math.max(0, viewportWidth - right)}px`, height: `${height}px` });

    const placement = resolveTutorialCalloutPlacement(
      viewportWidth,
      viewportHeight,
      { x, y, width, height },
      this.callout.offsetWidth || 440,
      this.callout.offsetHeight || 210
    );
    this.callout.style.left = `${placement.x}px`;
    this.callout.style.top = `${placement.y}px`;
    this.callout.dataset.position = placement.position;
    const placeBelow = placement.position === 'below';
    this.arrow.style.left = `${x + width / 2}px`;
    this.arrow.style.top = `${placeBelow ? bottom + 5 : y - 5}px`;
    this.arrow.dataset.position = placeBelow ? 'below' : 'above';
    this.arrow.hidden = placement.position === 'center';
  }
}
