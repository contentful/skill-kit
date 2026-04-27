import type { ActSegment, ActBuilder } from './types.js';
import { askUser } from './primitives/ask-user.js';
import { confirm } from './primitives/confirm.js';
import { plan as planBuilder } from './primitives/plan.js';
import { checklist } from './primitives/checklist.js';
import { subagent } from './primitives/subagent.js';
import { survey } from './primitives/survey.js';

function wrap(primitive: ActSegment['primitive']): ActSegment {
  return Object.freeze({ kind: 'act' as const, primitive });
}

export const act: ActBuilder = {
  askUser: (input) => wrap(askUser(input)),
  confirm: (input) => wrap(confirm(input)),
  plan: (input) => wrap(planBuilder(input)),
  checklist: (input) => wrap(checklist(input)),
  subagent: (input) => wrap(subagent(input)),
  survey: (questions) => wrap(survey({ questions })),
};
