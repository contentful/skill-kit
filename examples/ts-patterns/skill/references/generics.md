# TypeScript Generics Cheat Sheet

## Basic generic function

```typescript
function identity<T>(value: T): T {
  return value;
}
```

## Constraining with `extends`

```typescript
function getLength<T extends { length: number }>(item: T): number {
  return item.length;
}
```

## Generic interfaces

```typescript
interface Box<T> {
  value: T;
  map<U>(fn: (val: T) => U): Box<U>;
}
```

## Conditional types

```typescript
type IsString<T> = T extends string ? true : false;
type A = IsString<'hello'>; // true
type B = IsString<42>; // false
```

## Mapped types

```typescript
type Readonly<T> = { readonly [K in keyof T]: T[K] };
type Partial<T> = { [K in keyof T]?: T[K] };
```

## Inference with `infer`

```typescript
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
```
