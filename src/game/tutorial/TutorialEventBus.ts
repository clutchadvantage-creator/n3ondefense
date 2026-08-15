import type { TutorialEvent } from './TutorialTypes.ts';

type Listener = (event: TutorialEvent) => void;

/** Lightweight synchronous gameplay/UI event stream. It owns no game state. */
export class TutorialEventBus {
  private static readonly listeners = new Set<Listener>();

  static emit<T>(type: string, payload?: T): void {
    const event = { type, payload } as TutorialEvent;
    for (const listener of TutorialEventBus.listeners) listener(event);
  }

  static subscribe(listener: Listener): () => void {
    TutorialEventBus.listeners.add(listener);
    return () => TutorialEventBus.listeners.delete(listener);
  }

  static clearForTests(): void {
    TutorialEventBus.listeners.clear();
  }
}
