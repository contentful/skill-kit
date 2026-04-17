export class StashStore {
  private readonly data = new Map<string, unknown>();

  set(stepName: string, value: unknown): void {
    this.data.set(stepName, Object.freeze(value));
  }

  get(stepName: string): unknown {
    return this.data.get(stepName);
  }

  all(): Readonly<Record<string, unknown>> {
    return Object.freeze(Object.fromEntries(this.data));
  }
}
