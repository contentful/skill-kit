export interface ChecklistItem {
  text: string;
  done: boolean;
}

export function checklist(items: ChecklistItem[]): string {
  return items.map((item) => `${item.done ? '✅' : '☐'} ${item.text}`).join('\n');
}
