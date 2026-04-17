import { table } from './table.js';
import { checklist } from './checklist.js';
import { diff } from './diff.js';
import { code } from './code.js';
import { kv } from './kv.js';
import { section } from './section.js';

export const render = { table, checklist, diff, code, kv, section } as const;
