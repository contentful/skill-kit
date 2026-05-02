function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepMerge(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return source;
  }

  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    if (sourceVal === undefined) continue;
    if (key in result && isPlainObject(result[key]) && isPlainObject(sourceVal)) {
      result[key] = deepMerge(result[key], sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}
