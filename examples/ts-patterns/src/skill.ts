import { reference, render } from '../../../src/index.js';

export default reference({
  name: 'ts-patterns',
  version: '1.0.0',
  description:
    'TypeScript patterns and idioms reference. Use when writing TypeScript and need a quick ' +
    'refresher on generics, discriminated unions, builder patterns, or error handling.',
})
  .topic('generics', {
    label: 'Generics cheat sheet — constraints, conditional types, mapped types, infer',
    content: ({ refs }) => refs.load('generics.md'),
  })
  .topic('discriminated-unions', {
    label: 'Discriminated unions — type narrowing with literal discriminants',
    content: () =>
      [
        '# Discriminated Unions',
        '',
        'Use a literal `type` or `kind` field to narrow union members:',
        '',
        render.code(
          [
            "type Shape =",
            "  | { kind: 'circle'; radius: number }",
            "  | { kind: 'rect'; width: number; height: number };",
            "",
            "function area(s: Shape): number {",
            "  switch (s.kind) {",
            "    case 'circle': return Math.PI * s.radius ** 2;",
            "    case 'rect':   return s.width * s.height;",
            "  }",
            "}",
          ].join('\n'),
          'typescript',
        ),
        '',
        'TypeScript narrows the type inside each `case` branch automatically.',
        'Exhaustiveness: add `default: return s satisfies never;` to catch missing cases.',
      ].join('\n'),
  })
  .topic('builder-pattern', {
    label: 'Builder pattern — fluent APIs with type accumulation',
    content: () =>
      [
        '# Builder Pattern',
        '',
        'Return `this` from each method for chaining. Use generics to accumulate type information:',
        '',
        render.code(
          [
            'class QueryBuilder<T> {',
            '  where(clause: string): QueryBuilder<T> { /* ... */ return this; }',
            '  select<U>(...cols: (keyof T)[]): QueryBuilder<Pick<T, typeof cols[number]>> {',
            '    return this as any;',
            '  }',
            '  build(): Query<T> { /* ... */ }',
            '}',
          ].join('\n'),
          'typescript',
        ),
        '',
        'Each `.select()` narrows the result type. `.build()` produces the final typed query.',
      ].join('\n'),
  })
  .topic('error-handling', {
    label: 'Error handling — Result types, custom errors, exhaustive matching',
    content: () => {
      const patterns = render.table(
        [
          { pattern: 'try/catch', use: 'External APIs, I/O', note: 'Catch specific error types' },
          { pattern: 'Result<T, E>', use: 'Domain logic', note: 'Forces caller to handle both paths' },
          { pattern: 'Custom Error class', use: 'Typed error codes', note: 'Extend Error, add fields' },
          { pattern: 'never in switch', use: 'Exhaustive matching', note: 'Compile-time missing-case check' },
        ],
        { columns: ['pattern', 'use', 'note'] },
      );

      return ['# Error Handling Patterns', '', patterns].join('\n');
    },
  })
  .build();
