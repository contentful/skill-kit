/**
 * Type-level testing utilities.
 *
 * These are used in .test-d.ts files. The test runner is `tsc --noEmit`.
 * A passing test compiles silently. A failing test produces a type error.
 */

/** Asserts that a type extends `true`. Use with Equal, Extends, etc. */
export type Expect<T extends true> = T;

/** True if A and B are exactly the same type (bidirectional extends). */
export type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** True if A extends B (A is assignable to B). */
export type Extends<A, B> = A extends B ? true : false;

/** True if T is `never`. */
export type IsNever<T> = [T] extends [never] ? true : false;

/** True if T includes `undefined` in its union. */
export type IsOptional<T> = undefined extends T ? true : false;

/** True if T does NOT include `undefined`. */
export type IsRequired<T> = undefined extends T ? false : true;

/** Extract the type of a specific key from an object type. */
export type ValueAt<T, K extends keyof T> = T[K];
