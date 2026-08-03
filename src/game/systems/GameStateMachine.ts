import { RoundState } from '../types';

type StateListener = (next: RoundState, prev: RoundState) => void;

export class GameStateMachine {
  private current: RoundState;
  private listeners: StateListener[] = [];

  constructor(initial: RoundState = RoundState.PrePlant) {
    this.current = initial;
  }

  get state(): RoundState {
    return this.current;
  }

  set(next: RoundState): void {
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    for (const listener of this.listeners) {
      listener(next, prev);
    }
  }

  onChange(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
