import { Fragment, type ReactNode } from 'react';
import type { MessageKey, ParamValue, Translator } from '@chefer/i18n';

// ADR 0004, "rich text": a message that holds a link or bold word is ONE
// catalog string, so word order can differ per language. Two kinds of markup:
//
//   {name}              a node the caller passes in `parts` (a link, a button)
//   <em>…</em>          emphasis, <strong>…</strong> bold (plain text inside)
//
//   rich(t, 'auth.login.agree', { terms: <Link …>…</Link>, privacy: <Link …>…</Link> })
//
// Plain `{placeholders}` (names, numbers) go in `params` and are filled by the
// translator as usual.

const MARKUP = /(<em>[^<]*<\/em>|<strong>[^<]*<\/strong>|\{\w+\})/g;
const EM = /^<em>([^<]*)<\/em>$/;
const STRONG = /^<strong>([^<]*)<\/strong>$/;
const TOKEN = /^\{(\w+)\}$/;

export function rich(
  t: Translator['t'],
  key: MessageKey,
  parts: Record<string, ReactNode> = {},
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
  return text.split(MARKUP).map((chunk, index) => {
    const em = EM.exec(chunk)?.[1];
    if (em !== undefined) return <em key={index}>{em}</em>;
    const strong = STRONG.exec(chunk)?.[1];
    if (strong !== undefined) return <strong key={index}>{strong}</strong>;
    const name = TOKEN.exec(chunk)?.[1];
    const node = name === undefined ? undefined : parts[name];
    return <Fragment key={index}>{node === undefined ? chunk : node}</Fragment>;
  });
}
