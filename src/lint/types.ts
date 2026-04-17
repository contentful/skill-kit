export interface LintDiagnostic {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  step?: string;
  file?: string;
}
