import './feedback-report.css';
import { GAME_VERSION } from '../../game/config/version';

export interface FeedbackReportHandle {
  open(): void;
  destroy(): void;
}

interface FeedbackReportOptions {
  showLaunchButton?: boolean;
}

const REPORT_EMAIL = 'runtwerkx.dev@gmail.com';

export const mountFeedbackReportUi = (root: HTMLElement, options: FeedbackReportOptions = {}): FeedbackReportHandle => {
  const launchButton = document.createElement('button');
  launchButton.type = 'button';
  launchButton.className = 'feedback-launch';
  launchButton.textContent = 'Suggestions / Bug Reports';
  launchButton.setAttribute('aria-haspopup', 'dialog');
  if (options.showLaunchButton !== false) root.append(launchButton);

  let backdrop: HTMLDivElement | null = null;

  const close = (): void => {
    backdrop?.remove();
    backdrop = null;
    if (launchButton.isConnected) launchButton.focus();
  };

  const open = (): void => {
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.className = 'feedback-backdrop';
    backdrop.setAttribute('role', 'presentation');

    const form = document.createElement('form');
    form.className = 'feedback-dialog';
    form.setAttribute('role', 'dialog');
    form.setAttribute('aria-modal', 'true');
    form.setAttribute('aria-labelledby', 'feedback-title');

    const title = document.createElement('h2');
    title.id = 'feedback-title';
    title.textContent = 'SUGGESTIONS & BUG REPORTS';

    const intro = document.createElement('p');
    intro.textContent = 'Tell RuntWerkx what happened. Your email app will open with the report ready for you to review and send.';

    const categoryLabel = document.createElement('label');
    categoryLabel.textContent = 'REPORT TYPE';
    const category = document.createElement('select');
    category.required = true;
    for (const optionText of ['Suggestion', 'Game crashed', "Game wouldn't load", 'Lost progress', 'Gameplay issue', 'Visual issue', 'Audio issue', 'Other']) {
      const option = document.createElement('option');
      option.value = optionText;
      option.textContent = optionText;
      category.append(option);
    }
    categoryLabel.append(category);

    const descriptionLabel = document.createElement('label');
    descriptionLabel.textContent = 'SHORT DESCRIPTION';
    const description = document.createElement('textarea');
    description.required = true;
    description.maxLength = 1000;
    description.rows = 6;
    description.placeholder = 'What happened, what were you doing, and can you make it happen again?';
    descriptionLabel.append(description);

    const note = document.createElement('p');
    note.className = 'feedback-note';
    note.textContent = `Reports are addressed to ${REPORT_EMAIL}. No game or profile data is attached automatically.`;

    const actions = document.createElement('div');
    actions.className = 'feedback-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'feedback-button secondary';
    cancel.textContent = 'Cancel';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'feedback-button primary';
    submit.textContent = 'Open Email Report';
    actions.append(cancel, submit);
    form.append(title, intro, categoryLabel, descriptionLabel, note, actions);
    backdrop.append(form);
    root.append(backdrop);

    cancel.addEventListener('click', close);
    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const subject = `[N3ONDefense ${GAME_VERSION}] ${category.value}`;
      const body = [
        `Report type: ${category.value}`,
        `Game version: ${GAME_VERSION}`,
        '',
        description.value.trim()
      ].join('\n');
      window.location.href = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      close();
    });
    window.setTimeout(() => category.focus(), 0);
  };

  launchButton.addEventListener('click', open);
  return {
    open,
    destroy: () => {
      backdrop?.remove();
      backdrop = null;
      launchButton.removeEventListener('click', open);
      launchButton.remove();
    }
  };
};
