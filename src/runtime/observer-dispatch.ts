import type { ObserverMap } from '../types.js';

type ObserverEvent = keyof ObserverMap;

export class ObserverDispatcher {
  private readonly observers: ObserverMap;
  private pending: Promise<void>[] = [];

  constructor(observers: ObserverMap) {
    this.observers = observers;
  }

  fire<E extends ObserverEvent>(event: E, payload: Parameters<NonNullable<ObserverMap[E]>>[0]): void {
    const handler = this.observers[event];
    if (!handler) return;

    const frozen = structuredClone(payload);
    const promise = Promise.resolve()
      .then(() => (handler as (arg: unknown) => void | Promise<void>)(frozen))
      .catch((err) => {
        process.stderr.write(`[skill-kit] observer ${event} error: ${err}\n`);
      });

    this.pending.push(promise);
  }

  async flush(): Promise<void> {
    await Promise.all(this.pending);
    this.pending = [];
  }
}
