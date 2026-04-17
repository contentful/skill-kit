import type { ReferenceBuilderConfig } from './types.js';
import { ReferenceBuilder } from './reference-builder.js';

export function reference(config: ReferenceBuilderConfig): ReferenceBuilder {
  return new ReferenceBuilder(config);
}
