export interface PreambleRow {
  tag: string;
  tool: string;
  instruction: string;
}

export interface Primitive<TInput, TConfig, TTools extends readonly string[]> {
  readonly tag: string;
  readonly tools: TTools;
  create(input: TInput): TConfig;
  render(config: TConfig): string;
  preambleRow(tool: string | undefined): PreambleRow;
}

export function definePrimitive<TInput, TConfig, const TTools extends readonly string[]>(def: {
  tag: string;
  tools: TTools;
  create: (input: TInput) => TConfig;
  render: (config: TConfig) => string;
  preambleRow: (tool: string | undefined) => PreambleRow;
}): Primitive<TInput, TConfig, TTools> {
  return def;
}
