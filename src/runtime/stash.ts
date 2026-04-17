export class StashStore {
  private data: Record<string, unknown> = {};

  merge(partial: Record<string, unknown>): void {
    this.data = { ...this.data, ...partial };
  }

  all(): Readonly<Record<string, unknown>> {
    return Object.freeze({ ...this.data });
  }
}
