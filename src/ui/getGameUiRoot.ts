export const getGameUiRoot = (): HTMLElement => {
  const root = document.querySelector<HTMLElement>('#game-ui-root');
  if (!root) {
    throw new Error('Missing #game-ui-root mount node.');
  }
  return root;
};
