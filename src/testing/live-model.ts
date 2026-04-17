import type { ModelAdapter } from '../types.js';

export function liveModel(): ModelAdapter {
  throw new Error('liveModel() is not implemented in v0.1. Use mockModel() for testing.');
}
