import type { en } from './catalog/en';

// ─── Catalog types (ADR 0002) ────────────────────────────────────────────────
// English is the source catalog. Every other locale is typed from it, so a
// missing or extra key is a type error, and `t()` only accepts real keys with
// the placeholders the English message uses.

/**
 * A message that changes with a count. English writes `one` + `other`,
 * Romanian `one` + `few` + `other` (see plural.ts); the catalog check
 * enforces which forms each locale must have.
 */
export type PluralMessage = {
  readonly one?: string;
  readonly few?: string;
  readonly other: string;
};

type Widen<T> = T extends string
  ? string
  : T extends { readonly other: string }
    ? PluralMessage
    : { readonly [K in keyof T]: Widen<T[K]> };

export type SourceCatalog = typeof en;
/** The shape every locale's catalog must have. */
export type Catalog = Widen<SourceCatalog>;
export type Namespace = keyof Catalog;

type Leaves<T, Prefix extends string> = {
  [K in keyof T & string]: T[K] extends string | { readonly other: string }
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every translatable key: "common.actions.save", "auth.login.title". */
export type MessageKey = Leaves<SourceCatalog, ''>;

type At<T, Path extends string> = Path extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? At<T[Head], Rest>
    : never
  : Path extends keyof T
    ? T[Path]
    : never;

type Placeholders<S> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type MessageAt<K extends MessageKey> = At<SourceCatalog, K>;

/** Values a message interpolates. Numbers are formatted for the locale. */
export type ParamValue = string | number;

/** The params `t(key, …)` needs: `{ count }` for plurals plus every `{name}`. */
export type ParamsFor<K extends MessageKey> =
  MessageAt<K> extends { readonly other: infer Other }
    ? { count: number } & Record<Exclude<Placeholders<Other>, 'count'>, ParamValue>
    : Record<Placeholders<MessageAt<K>>, ParamValue>;

export type TArgs<K extends MessageKey> = [Placeholders<MessageAt<K>>] extends [never]
  ? MessageAt<K> extends { readonly other: string }
    ? [params: ParamsFor<K>]
    : [params?: undefined]
  : [params: ParamsFor<K>];
