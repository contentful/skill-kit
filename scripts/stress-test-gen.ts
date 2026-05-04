export {};

/**
 * Generator for type-level stress test files.
 *
 * Produces .test-d.ts files with parameterized complexity for
 * binary-searching TypeScript's type checker limits.
 *
 * Usage:
 *   node --import tsx/esm src/types/stress-test-gen.ts --steps 50
 *   node --import tsx/esm src/types/stress-test-gen.ts --branches 10
 *   node --import tsx/esm src/types/stress-test-gen.ts --steps 20 --branches 5 --reconverge 3
 *   node --import tsx/esm src/types/stress-test-gen.ts --steps 40 --out /tmp/chain-40.test-d.ts
 *
 * Options:
 *   --steps N        Linear chain depth (default: 10)
 *   --branches N     Width of a single branch point (default: 0, skip)
 *   --multi N        Number of sequential 2-way branches (default: 0, skip)
 *   --reconverge N   Number of branch→reconverge cycles (default: 0, skip)
 *   --stores N       Number of nested sub-store levels (default: 0, skip)
 *   --out PATH       Output file path (default: stdout)
 *
 * Observed limits (TypeScript 5.9, strict, 2024 MacBook):
 *   Linear chain:     ~300 steps before 30s practical limit
 *   Branch width:     100+ targets with no slowdown (<6s)
 *   Multi-branch:     50+ sequential branches with no slowdown (<7s)
 *   Reconvergence:    50+ cycles with no slowdown (<7s)
 *   Store depth:      10+ nesting levels with no slowdown (<5s)
 *
 * The bottleneck is linear chain depth. Each .step() call creates a new
 * intersection layer in TSteps. At ~300 layers TypeScript spends most
 * of its time resolving the deeply nested intersection type.
 */

const args = process.argv.slice(2);

function getArg(name: string, fallback: number): number {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return parseInt(args[idx + 1]!, 10);
}

function getStringArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1]!;
}

const stepCount = getArg('steps', 10);
const branchWidth = getArg('branches', 0);
const multiCount = getArg('multi', 0);
const reconvergeCount = getArg('reconverge', 0);
const storeDepth = getArg('stores', 0);
const outPath = getStringArg('out', '');

const lines: string[] = [];

function emit(line: string) {
  lines.push(line);
}

function pad(n: number, width: number = 2): string {
  return String(n).padStart(width, '0');
}

// --- Header ---
emit(`/**`);
emit(` * Auto-generated type-level stress test.`);
emit(
  ` * steps=${stepCount} branches=${branchWidth} multi=${multiCount} reconverge=${reconvergeCount} stores=${storeDepth}`,
);
emit(` *`);
emit(` * Run: pnpm exec tsc --noEmit`);
emit(` */`);
emit(``);
emit(`import { type } from 'arktype';`);
emit(`import { skill } from '../index.js';`);
emit(``);

// --- Linear chain ---
if (stepCount > 0) {
  emit(`// Linear chain: ${stepCount} steps`);
  emit(`skill({ name: 'gen-linear-${stepCount}', entry: 's${pad(1)}' })`);

  for (let i = 1; i <= stepCount; i++) {
    const name = `s${pad(i)}`;
    const field = `f${pad(i)}`;
    const isLast = i === stepCount;
    const nextStr = isLast ? `{ terminal: true }` : `'s${pad(i + 1)}'`;

    if (i === 1) {
      emit(`  .step('${name}', {`);
      emit(`    prompt: 'Step ${i}',`);
      emit(`    response: type({ ${field}: 'string' }),`);
      emit(`    next: ${nextStr},`);
      emit(`  })`);
    } else {
      const prevName = `s${pad(i - 1)}`;
      const prevField = `f${pad(i - 1)}`;
      emit(`  .step('${name}', {`);
      emit(`    prompt: ({ store }) => {`);
      emit(`      const v: string = store.steps.${prevName}.${prevField};`);
      emit(`      void v;`);

      // At last step, also verify first step is still accessible
      if (isLast && i > 2) {
        emit(`      // Verify first step still accessible at depth ${i}`);
        emit(`      const first: string = store.steps.s${pad(1)}.f${pad(1)};`);
        emit(`      void first;`);
      }

      emit(`      return 'Step ${i}';`);
      emit(`    },`);
      if (!isLast) {
        emit(`    response: type({ ${field}: 'string' }),`);
      } else {
        emit(`    response: type({}),`);
      }
      emit(`    next: ${nextStr},`);
      emit(`  })`);
    }
  }
  emit(`;`);
  emit(``);
}

// --- Branch width ---
if (branchWidth >= 2) {
  emit(`// Branch width: ${branchWidth}-way`);
  emit(`skill({ name: 'gen-branch-${branchWidth}', entry: 'bw-root' })`);
  emit(`  .step('bw-root', {`);
  emit(`    prompt: 'Root',`);
  emit(`    response: type({ choice: 'string' }),`);

  // Build the branch array
  const branchEntries: string[] = [];
  for (let i = 1; i <= branchWidth; i++) {
    const target = `bw${pad(i)}`;
    if (i < branchWidth) {
      branchEntries.push(`      { to: '${target}', when: ({ response }) => response.choice === '${i}' }`);
    } else {
      branchEntries.push(`      { to: '${target}' }`);
    }
  }
  emit(`    next: [`);
  emit(branchEntries.join(',\n'));
  emit(`    ],`);
  emit(`  })`);

  // Define each target
  for (let i = 1; i <= branchWidth; i++) {
    const name = `bw${pad(i)}`;
    const field = `v${pad(i)}`;
    emit(`  .step('${name}', { prompt: '${name}', response: type({ ${field}: 'number' }), next: 'bw-join' })`);
  }

  // Join step
  emit(`  .step('bw-join', {`);
  emit(`    prompt: ({ store }) => {`);
  emit(`      const choice: string = store.steps['bw-root'].choice;`);
  emit(`      void choice;`);
  for (let i = 1; i <= branchWidth; i++) {
    const name = `bw${pad(i)}`;
    const field = `v${pad(i)}`;
    emit(`      const ${field} = store.steps['${name}']?.${field};`);
    emit(`      void ${field};`);
  }
  emit(`      return 'Join';`);
  emit(`    },`);
  emit(`    response: type({}),`);
  emit(`    next: { terminal: true },`);
  emit(`  });`);
  emit(``);
}

// --- Multiple sequential branches ---
if (multiCount > 0) {
  emit(`// Multiple sequential branches: ${multiCount} x 2-way`);
  emit(`skill({ name: 'gen-multi-${multiCount}', entry: 'mu-start' })`);
  emit(`  .step('mu-start', { prompt: 'Start', response: type({ val: 'string' }), next: 'mu-br1' })`);

  for (let b = 1; b <= multiCount; b++) {
    const brName = `mu-br${b}`;
    const aName = `mu-a${b}`;
    const bName = `mu-b${b}`;
    const mergeName = b < multiCount ? `mu-merge${b}` : 'mu-end';
    const nextAfterMerge = b < multiCount ? `'mu-br${b + 1}'` : `{ terminal: true }`;

    emit(`  .step('${brName}', {`);
    emit(`    prompt: 'Branch ${b}',`);
    emit(`    response: type({ p${b}: 'string' }),`);
    emit(`    next: [{ to: '${aName}', when: ({ response }) => response.p${b} === 'a' }, { to: '${bName}' }],`);
    emit(`  })`);
    emit(`  .step('${aName}', { prompt: 'A${b}', response: type({ va${b}: 'string' }), next: '${mergeName}' })`);
    emit(`  .step('${bName}', { prompt: 'B${b}', response: type({ vb${b}: 'string' }), next: '${mergeName}' })`);

    if (b < multiCount) {
      emit(
        `  .step('${mergeName}', { prompt: 'Merge ${b}', response: type({ m${b}: 'string' }), next: ${nextAfterMerge} })`,
      );
    } else {
      // Last merge — verify narrowing
      emit(`  .step('${mergeName}', {`);
      emit(`    prompt: ({ store }) => {`);
      emit(`      // Verify linear predecessors guaranteed`);
      emit(`      const val: string = store.steps['mu-start'].val;`);
      emit(`      void val;`);
      for (let j = 1; j < b; j++) {
        emit(`      const m${j}: string = store.steps['mu-merge${j}'].m${j};`);
        emit(`      void m${j};`);
      }
      emit(`      // Branch targets optional`);
      emit(`      const va1 = store.steps['mu-a1']?.va1;`);
      emit(`      void va1;`);
      emit(`      return 'End';`);
      emit(`    },`);
      emit(`    response: type({}),`);
      emit(`    next: ${nextAfterMerge},`);
      emit(`  })`);
    }
  }
  emit(`;`);
  emit(``);
}

// --- Reconvergence chains ---
if (reconvergeCount > 0) {
  emit(`// Reconvergence chains: ${reconvergeCount} cycles`);
  emit(`skill({ name: 'gen-reconverge-${reconvergeCount}', entry: 'rc-start' })`);
  emit(`  .step('rc-start', { prompt: 'Start', response: type({ val: 'string' }), next: 'rc-gather1' })`);

  for (let c = 1; c <= reconvergeCount; c++) {
    const gatherName = `rc-gather${c}`;
    const targetA = `rc-path-a${c}`;
    const targetB = `rc-target${c}`;
    const nextStep = c < reconvergeCount ? `'rc-gather${c + 1}'` : `'rc-final'`;

    // The reconvergence pattern: gather → [path-a, target], path-a → target
    // target is on ALL paths, so it gets promoted
    emit(`  .step('${gatherName}', {`);
    emit(`    prompt: 'Gather ${c}',`);
    emit(`    response: type({ choice${c}: 'string' }),`);
    emit(
      `    next: [{ to: '${targetA}', when: ({ response }) => response.choice${c} === 'a' }, { to: '${targetB}' }],`,
    );
    emit(`  })`);
    emit(`  .step('${targetA}', { prompt: 'Path A${c}', response: type({ a${c}val: 'string' }), next: '${targetB}' })`);
    emit(`  .step('${targetB}', {`);
    emit(`    prompt: ({ store }) => {`);
    emit(`      // path-a is optional (branch target)`);
    emit(`      const a = store.steps['${targetA}']?.a${c}val;`);
    emit(`      void a;`);
    emit(`      return 'Target ${c}';`);
    emit(`    },`);
    emit(`    response: type({ t${c}val: 'string' }),`);
    emit(`    next: ${nextStep},`);
    emit(`  })`);
  }

  // Final step — verify reconvergence promotions
  emit(`  .step('rc-final', {`);
  emit(`    prompt: ({ store }) => {`);
  emit(`      const val: string = store.steps['rc-start'].val;`);
  emit(`      void val;`);
  for (let c = 1; c <= reconvergeCount; c++) {
    emit(`      // rc-target${c} promoted via reconvergence — guaranteed`);
    emit(`      const t${c}: string = store.steps['rc-target${c}'].t${c}val;`);
    emit(`      void t${c};`);
  }
  emit(`      return 'Final';`);
  emit(`    },`);
  emit(`    response: type({}),`);
  emit(`    next: { terminal: true },`);
  emit(`  });`);
  emit(``);
}

// --- Nested sub-stores ---
if (storeDepth > 0) {
  // Build a nested ArkType schema string
  function buildNestedSchema(depth: number, prefix: string = 'level'): string {
    if (depth <= 1) {
      return `{ ${prefix}1_val: 'string' }`;
    }
    const inner = buildNestedSchema(depth - 1, prefix);
    return `{ ${prefix}${depth}_key: 'string', nested: ${inner} }`;
  }

  const schema = buildNestedSchema(storeDepth);

  emit(`// Nested sub-store: ${storeDepth} levels deep`);
  emit(`skill({`);
  emit(`  name: 'gen-nested-store-${storeDepth}',`);
  emit(`  entry: 'ns-start',`);
  emit(`  stores: {`);
  emit(`    deep: type(${schema}),`);
  emit(`  },`);
  emit(`})`);
  emit(`  .step('ns-start', {`);
  emit(`    prompt: 'Start',`);
  emit(`    response: type({ val: 'string' }),`);

  // Build a partial write for the outermost level
  emit(`    save: () => ({`);
  emit(`      deep: { level${storeDepth}_key: 'written' },`);
  emit(`    }),`);
  emit(`    next: 'ns-use',`);
  emit(`  })`);
  emit(`  .step('ns-use', {`);
  emit(`    prompt: ({ store }) => {`);
  emit(`      // Guaranteed write`);
  emit(`      const key: string = store.deep.level${storeDepth}_key;`);
  emit(`      void key;`);

  // Optional access to unwritten nested levels
  if (storeDepth >= 2) {
    emit(`      // Unwritten nested levels — optional`);
    emit(`      const nested = store.deep?.nested?.level${storeDepth - 1}_key;`);
    emit(`      void nested;`);
  }

  emit(`      return 'Use';`);
  emit(`    },`);
  emit(`    response: type({}),`);
  emit(`    next: { terminal: true },`);
  emit(`  });`);
  emit(``);
}

// --- Output ---
const output = lines.join('\n') + '\n';

if (outPath) {
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, output, 'utf-8');
  console.log(`Written to ${outPath}`);
} else {
  process.stdout.write(output);
}
