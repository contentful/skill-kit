export interface BuildTarget {
  name: string;
  bunTarget: string;
}

export const DEFAULT_TARGETS: BuildTarget[] = [
  { name: 'darwin-arm64', bunTarget: 'bun-darwin-arm64' },
  { name: 'linux-x64', bunTarget: 'bun-linux-x64' },
];

export const ALL_TARGETS: BuildTarget[] = [
  { name: 'darwin-arm64', bunTarget: 'bun-darwin-arm64' },
  { name: 'darwin-x64', bunTarget: 'bun-darwin-x64' },
  { name: 'linux-arm64', bunTarget: 'bun-linux-arm64' },
  { name: 'linux-x64', bunTarget: 'bun-linux-x64' },
];

export function resolveTargets(targetNames?: string[]): BuildTarget[] {
  if (!targetNames) return DEFAULT_TARGETS;

  return targetNames.map((name) => {
    const target = ALL_TARGETS.find((t) => t.name === name);
    if (!target)
      throw new Error(`Unknown build target: "${name}". Known: ${ALL_TARGETS.map((t) => t.name).join(', ')}`);
    return target;
  });
}
