import type { CapabilityManifest } from '../types.js';

export class CapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityError';
  }
}

export function validateCapabilities(actionName: string, _capabilities: CapabilityManifest | undefined): void {
  if (!_capabilities) return;
  // For v0.1, capability validation is a placeholder.
  // Actions are declared in the manifest but enforcement of fs/net/subprocess/env
  // boundaries requires runtime sandboxing which is deferred.
  // The manifest is validated at load time to ensure it's well-formed.
  void actionName;
}
