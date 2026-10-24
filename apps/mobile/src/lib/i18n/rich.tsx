import { Fragment, type ReactNode } from 'react';
import type { MessageKey, ParamValue, Translator } from '@chefer/i18n';

// ADR 0004, "rich text": a message that holds a link or bold word is ONE
// catalog string with `{name}` placeholders, so word order can differ per
// language. `rich()` fills the plain params through the translator and then
// swaps each `{name}` for the node in `parts`:
//
//   rich(t, 'auth.login.agree', { terms: <Link …>…</Link>, privacy: <Link …>…</Link> })

const TOKEN = /(\{\w+\})/g;

export function rich(
  t: Translator['t'],
  key: MessageKey,
  parts: Record<string, ReactNode>,
  params: Record<string, ParamValue> = {},
): ReactNode {
  // Hand every node placeholder back untouched, then split on it.
  const keep = Object.fromEntries(Object.keys(parts).map((name) => [name, `{${name}}`]));
  // The part names are only known at the call site, so the typed params of `t`
  // cannot describe them; the key itself stays checked by `MessageKey`.
  const text = (t as unknown as (k: MessageKey, p: Record<string, ParamValue>) => string)(key, {
    ...keep,
    ...params,
  });
  return text.split(TOKEN).map((chunk, index) => {
    const name = /^\{(\w+)\}$/.exec(chunk)?.[1];
    const node = name === undefined ? undefined : parts[name];
    return <Fragment key={index}>{node === undefined ? chunk : node}</Fragment>;
  });
}
