// `jest-axe` augments Jest's matcher types, not Vitest's, so `expect(...).toHaveNoViolations()`
// is otherwise untyped under this project's tsconfig (`include: ["src"]`). The matcher itself is
// registered at runtime in src/test/setup.ts via `expect.extend(toHaveNoViolations)`.
import 'vitest';

interface CustomMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
