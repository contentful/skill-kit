export function generatePackageJson(name: string, version: string): string {
  return JSON.stringify(
    {
      name,
      version,
    },
    null,
    2,
  );
}
