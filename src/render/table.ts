export interface TableOptions {
  columns?: string[];
  statusIcons?: Record<string, string>;
}

export function table(rows: Record<string, unknown>[], opts?: TableOptions): string {
  if (rows.length === 0) return '';

  const columns = opts?.columns ?? Object.keys(rows[0]!);
  const statusIcons = opts?.statusIcons;

  const formatCell = (value: unknown, col: string): string => {
    const str = String(value ?? '');
    if (statusIcons && col === 'status' && str in statusIcons) {
      return statusIcons[str]!;
    }
    return str;
  };

  const header = `| ${columns.join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((col) => formatCell(row[col], col)).join(' | ')} |`);

  return [header, separator, ...body].join('\n');
}
