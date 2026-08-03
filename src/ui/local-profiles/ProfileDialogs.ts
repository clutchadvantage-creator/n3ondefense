export interface DialogHandle {
  destroy(): void;
}

export interface ConfirmDialogOptions {
  root: HTMLElement;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export interface InfoDialogOptions {
  root: HTMLElement;
  title: string;
  body: string;
  actions: Array<{ label: string; onClick(): void; danger?: boolean; primary?: boolean }>;
}

export interface NameInputDialogOptions {
  root: HTMLElement;
  title: string;
  body: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel: string;
  cancelLabel?: string;
  validate(value: string): string | null;
  onSubmit(value: string): void;
  onCancel(): void;
}

export const pickJsonFile = async (): Promise<File | null> => {
  return await new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    document.body.append(input);

    let settled = false;

    const cleanup = (): void => {
      input.removeEventListener('change', onChange);
      window.removeEventListener('focus', onFocus);
      input.remove();
    };

    const finish = (file: File | null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    };

    const onChange = (): void => {
      finish(input.files?.[0] ?? null);
    };

    const onFocus = (): void => {
      window.setTimeout(() => {
        if (!settled) finish(null);
      }, 0);
    };

    input.addEventListener('change', onChange);
    window.addEventListener('focus', onFocus, { once: true });
    input.click();
  });
};

export const downloadJsonFile = (fileName: string, payload: unknown): void => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  anchor.rel = 'noreferrer';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const showConfirmDialog = (options: ConfirmDialogOptions): DialogHandle => {
  const modal = createModalShell(options.root, options.title, options.body);
  const actions = document.createElement('div');
  actions.className = 'profile-modal-actions';

  const cancel = createButton(options.cancelLabel ?? 'CANCEL', 'secondary');
  cancel.addEventListener('click', () => {
    destroy();
    options.onCancel();
  });

  const confirm = createButton(options.confirmLabel, options.danger ? 'danger' : 'primary');
  confirm.addEventListener('click', () => {
    destroy();
    options.onConfirm();
  });

  actions.append(cancel, confirm);
  modal.form.append(actions);

  const destroy = (): void => {
    modal.destroy();
  };

  modal.focus(confirm);
  return { destroy };
};

export const showInfoDialog = (options: InfoDialogOptions): DialogHandle => {
  const modal = createModalShell(options.root, options.title, options.body);
  const actions = document.createElement('div');
  actions.className = 'profile-modal-actions';

  for (const action of options.actions) {
    const button = createButton(action.label, action.danger ? 'danger' : action.primary ? 'primary' : 'secondary');
    button.addEventListener('click', () => {
      destroy();
      action.onClick();
    });
    actions.append(button);
  }

  modal.form.append(actions);

  const destroy = (): void => {
    modal.destroy();
  };

  modal.focus(actions.querySelector('button') ?? undefined);
  return { destroy };
};

export const showNameInputDialog = (options: NameInputDialogOptions): DialogHandle => {
  const modal = createModalShell(options.root, options.title, options.body);
  const field = document.createElement('label');
  field.className = 'profile-modal-field';
  field.textContent = options.label;

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 20;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = options.placeholder ?? '';
  input.value = options.initialValue ?? '';

  const error = document.createElement('p');
  error.className = 'profile-modal-error';
  error.hidden = true;

  field.append(input, error);
  modal.form.append(field);

  const setError = (message: string | null): void => {
    if (!message) {
      error.hidden = true;
      error.textContent = '';
      return;
    }
    error.hidden = false;
    error.textContent = message;
  };

  const validate = (): boolean => {
    const message = options.validate(input.value);
    setError(message);
    return !message;
  };

  const submit = (): void => {
    if (!validate()) return;
    const value = input.value.trim();
    destroy();
    options.onSubmit(value);
  };

  const onInput = (): void => {
    validate();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      destroy();
      options.onCancel();
    }
  };

  input.addEventListener('input', onInput);

  const cancel = createButton(options.cancelLabel ?? 'CANCEL', 'secondary');
  cancel.addEventListener('click', () => {
    destroy();
    options.onCancel();
  });

  const confirm = createButton(options.confirmLabel, 'primary');
  confirm.type = 'submit';

  modal.actions.append(cancel, confirm);

  modal.form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });

  document.addEventListener('keydown', onKeyDown);

  const destroy = (): void => {
    document.removeEventListener('keydown', onKeyDown);
    input.removeEventListener('input', onInput);
    modal.destroy();
  };

  modal.focus(input);
  validate();
  return { destroy };
};

interface ModalShell {
  form: HTMLFormElement;
  actions: HTMLDivElement;
  focus(element?: HTMLElement | null): void;
  destroy(): void;
}

const createModalShell = (root: HTMLElement, title: string, body: string): ModalShell => {
  const backdrop = document.createElement('div');
  backdrop.className = 'profile-modal-backdrop';

  const form = document.createElement('form');
  form.className = 'profile-modal';
  form.noValidate = true;

  const heading = document.createElement('h2');
  heading.textContent = title;

  const paragraph = document.createElement('p');
  paragraph.textContent = body;

  const actions = document.createElement('div');
  actions.className = 'profile-modal-actions';

  form.append(heading, paragraph);
  backdrop.append(form);
  root.append(backdrop);

  const onBackdropClick = (event: MouseEvent): void => {
    if (event.target === backdrop) {
      event.preventDefault();
    }
  };

  backdrop.addEventListener('mousedown', onBackdropClick);

  return {
    form,
    actions,
    focus: (element?: HTMLElement | null) => {
      window.setTimeout(() => {
        const target = element ?? form.querySelector<HTMLElement>('input, button, select, textarea');
        target?.focus();
        if (target instanceof HTMLInputElement) {
          target.select();
        }
      }, 0);
    },
    destroy: () => {
      backdrop.removeEventListener('mousedown', onBackdropClick);
      backdrop.remove();
    }
  };
};

const createButton = (label: string, variant: 'primary' | 'secondary' | 'danger'): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `profile-button ${variant}`;
  button.textContent = label;
  return button;
};
