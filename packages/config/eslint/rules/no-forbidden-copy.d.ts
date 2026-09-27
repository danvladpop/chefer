/**
 * Hand-written declaration for the plain-JS ESLint rule module (this package
 * has no TS build step — `base.js` et al. are consumed directly by
 * `eslint.config.*` files, which are never typechecked). Consumers that DO
 * typecheck (e.g. `packages/utils/src/copy-lint.test.ts`) need this so
 * `containsForbiddenPhrase` isn't implicitly `any` under strict mode.
 */
export declare const FORBIDDEN_PHRASES: readonly string[];

/** Returns the first forbidden phrase found in `text`, or null. */
export declare function containsForbiddenPhrase(text: unknown): string | null;

/** The ESLint flat-config rule object ({ meta, create }). Untyped on purpose
 * to avoid this package needing `eslint`'s types just for consumers of the
 * phrase checker. */
export declare const noForbiddenCopy: unknown;

export default noForbiddenCopy;
