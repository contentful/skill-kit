// --- Terminal frame types: what to render in the terminal ---

export interface SurveyPicker {
  tabs: { label: string; done: boolean; active: boolean }[];
  question: string;
  options: { label: string; description?: string; selected?: boolean }[];
  footer: string;
}

export interface SurveyReview {
  tabs: { label: string; done: boolean; active: boolean }[];
  answers: { question: string; answer: string }[];
  confirmOptions: { label: string; selected?: boolean }[];
}

export interface AnswersSummary {
  answers: { question: string; answer: string }[];
}

export interface SubagentRunning {
  agentMessage: string;
  label: string;
  name: string;
  status: 'running';
  elapsed: string;
}

export interface SubagentDone {
  agentMessage: string;
  label: string;
  name: string;
  status: 'done';
  stats: string;
}

export interface PlanCard {
  title: string;
  steps: { heading: string; detail: string }[];
  approval: {
    question: string;
    options: { label: string; selected?: boolean }[];
  };
}

export interface ActionRunning {
  agentMessage: string;
  actionLabel: string;
}

export interface ActionDone {
  agentMessage: string;
  actionLabel: string;
  result: string;
}

export type TerminalFrame =
  | { type: 'survey-picker'; data: SurveyPicker }
  | { type: 'survey-review'; data: SurveyReview }
  | { type: 'answers-summary'; data: AnswersSummary }
  | { type: 'subagent-running'; data: SubagentRunning }
  | { type: 'subagent-done'; data: SubagentDone }
  | { type: 'plan'; data: PlanCard }
  | { type: 'action-running'; data: ActionRunning }
  | { type: 'action-done'; data: ActionDone };

// --- Scene: one step, multiple frames ---

export type SummaryLine =
  | { type: 'agent'; text: string }
  | { type: 'answers'; answers: { question: string; answer: string }[] }
  | { type: 'subagent'; label: string; name: string; stats: string }
  | { type: 'meta'; text: string };

export interface Scene {
  stepName: string;
  frames: { content: TerminalFrame; duration: number }[];
  summary: SummaryLine[];
}

// --- Storyboard ---

export interface HeroStoryboard {
  id: string;
  command: string;
  scenes: Scene[];
  code: string;
}

// --- Security Audit ---

export const securityAudit: HeroStoryboard = {
  id: 'security-audit',
  command: '/security-audit',
  scenes: [
    // --- gather-scope: survey picker → review → summary ---
    {
      stepName: 'gather-scope',
      summary: [
        { type: 'agent', text: 'Starting the security audit workflow.' },
        {
          type: 'answers',
          answers: [
            { question: 'Focus area?', answer: 'Authentication' },
            { question: 'Framework?', answer: 'React' },
          ],
        },
      ],
      frames: [
        {
          duration: 3800,
          content: {
            type: 'survey-picker',
            data: {
              tabs: [
                { label: 'Focus area', done: false, active: true },
                { label: 'Framework', done: false, active: false },
                { label: 'Submit', done: false, active: false },
              ],
              question: 'What should the audit focus on?',
              options: [
                { label: 'Authentication', description: 'Login flows, tokens, sessions', selected: true },
                { label: 'XSS Prevention', description: 'Input sanitization, CSP headers' },
                { label: 'Dependencies', description: 'Supply chain, outdated packages' },
              ],
              footer: 'Enter to select · Tab/Arrow keys to navigate',
            },
          },
        },
        {
          duration: 3000,
          content: {
            type: 'survey-review',
            data: {
              tabs: [
                { label: 'Focus area', done: true, active: false },
                { label: 'Framework', done: true, active: false },
                { label: 'Submit', done: false, active: true },
              ],
              answers: [
                { question: 'What should the audit focus on?', answer: 'Authentication' },
                { question: 'Which framework?', answer: 'React' },
              ],
              confirmOptions: [
                { label: 'Submit answers', selected: true },
                { label: 'Cancel' },
              ],
            },
          },
        },
        {
          duration: 2200,
          content: {
            type: 'answers-summary',
            data: {
              answers: [
                { question: 'What should the audit focus on?', answer: 'Authentication' },
                { question: 'Which framework?', answer: 'React' },
              ],
            },
          },
        },
      ],
    },

    // --- research: subagent running → done ---
    {
      stepName: 'research',
      summary: [
        { type: 'subagent', label: 'Explore', name: 'Research React auth security', stats: '5 tool uses · 10.3k tokens · 20s' },
      ],
      frames: [
        {
          duration: 3000,
          content: {
            type: 'subagent-running',
            data: {
              agentMessage: 'Researching authentication security for React projects.',
              label: 'Explore',
              name: 'Research React auth security',
              status: 'running',
              elapsed: '12s · 4.2k tokens · thinking more',
            },
          },
        },
        {
          duration: 2200,
          content: {
            type: 'subagent-done',
            data: {
              agentMessage: 'Got the research back. Let me continue with the findings.',
              label: 'Explore',
              name: 'Research React auth security',
              status: 'done',
              stats: '5 tool uses · 10.3k tokens · 20s',
            },
          },
        },
      ],
    },

    // --- plan-and-write: plan card ---
    {
      stepName: 'plan-and-write',
      summary: [
        { type: 'agent', text: 'Plan approved — proceeding with the audit.' },
      ],
      frames: [
        {
          duration: 5000,
          content: {
            type: 'plan',
            data: {
              title: 'Security Audit — React Authentication',
              steps: [
                { heading: 'Executive Summary', detail: 'High-level overview of auth posture' },
                { heading: 'Auth Flow Analysis', detail: 'Token lifecycle, session management' },
                { heading: 'Vulnerability Assessment', detail: 'XSS vectors, CSRF, injection risks' },
                { heading: 'Recommendations', detail: 'Prioritized remediation steps' },
              ],
              approval: {
                question: 'Does this plan look good?',
                options: [
                  { label: 'Yes, proceed', selected: true },
                  { label: 'Suggest changes' },
                ],
              },
            },
          },
        },
      ],
    },

    // --- save-report: action writes file ---
    {
      stepName: 'save-report',
      summary: [
        { type: 'agent', text: 'Done — wrote report to security-audit.md' },
      ],
      frames: [
        {
          duration: 3000,
          content: {
            type: 'action-running',
            data: {
              agentMessage: 'Writing the report based on the approved plan.',
              actionLabel: 'save-report',
            },
          },
        },
        {
          duration: 3500,
          content: {
            type: 'action-done',
            data: {
              agentMessage: 'Done — wrote report to security-audit.md',
              actionLabel: 'save-report',
              result: 'Wrote 4 sections (3.2 KB) → /tmp/security-audit.md',
            },
          },
        },
      ],
    },
  ],

  code: [
    "export default skill({",
    "  name: 'security-audit',",
    "  entry: 'gather-scope',",
    "})",
    "  .step('gather-scope', {",
    "    prompt: act.survey([",
    "      { question: 'Focus area?', options: ['Auth', 'XSS', 'Deps'] },",
    "      { question: 'Framework?', options: ['React', 'Vue', 'Svelte'] },",
    "    ]),",
    "    next: 'research',",
    "  })",
    "  .step('research', {",
    "    prompt: act.subagent({ prompt: 'Research best practices' }),",
    "    next: 'plan-and-write',",
    "  })",
    "  .step('plan-and-write', {",
    "    prompt: act.plan({ steps: ['Summary', 'Analysis', 'Findings', 'Recs'] }),",
    "    next: 'save-report',",
    "  })",
    "  .step('save-report', {",
    "    action: { run: saveReport },",
    "    next: terminal,",
    "  })",
    "  .build()",
  ].join('\n'),
};
