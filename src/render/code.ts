export function code(source: string, lang?: string): string {
  return `\`\`\`${lang ?? ''}\n${source}\n\`\`\``;
}
