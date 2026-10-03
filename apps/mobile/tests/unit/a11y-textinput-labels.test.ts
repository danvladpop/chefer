import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// UX-X-09 / WP-04: a placeholder is not an accessible name. Every raw
// `<TextInput …>` JSX element must carry its own `accessibilityLabel`
// (or `aria-label`, or a `*LabelledBy`). The kit's `Input` / `SearchField`
// default theirs from `label` / `placeholder`, so screens should prefer them;
// this guards the raw usages that remain. A violation is reported as
// `path:line` so the fix is one jump away.

const REPO = join(__dirname, '..', '..', '..', '..');
const SCANNED = ['apps/mobile/app', 'apps/mobile/src', 'packages/ui-mobile/src'];

/**
 * Raw TextInputs that predate this guard and live in files owned by other
 * work packages — fix in WP-03/WP-09 then
 * delete the entry; the test also fails on a STALE entry so the list can only
 * shrink. Entries are file paths (any line). Fix = add `accessibilityLabel`
 * (or switch to the kit's `Input` / `SearchField`, which default theirs).
 */
const ALLOW_LIST: readonly string[] = [
  'apps/mobile/app/(food)/shopping-list.tsx',
  'apps/mobile/app/chat.tsx',
  'apps/mobile/app/import-recipe.tsx',
  'apps/mobile/app/recipe-form.tsx',
  'apps/mobile/src/features/pantry/pantry-panel.tsx',
  'apps/mobile/src/features/preferences/components/metrics-step.tsx',
];

const LABEL_ATTR = /(^|\s)(accessibilityLabel|aria-label|accessibilityLabelledBy|aria-labelledby)=/;

function sourceFiles(path: string): string[] {
  const abs = join(REPO, path);
  if (statSync(abs).isFile()) return abs.endsWith('.tsx') ? [abs] : [];
  return readdirSync(abs).flatMap((name) =>
    name === 'node_modules' ? [] : sourceFiles(join(path, name)),
  );
}

/**
 * The TOP-LEVEL attribute text of the JSX opening tag that starts right after
 * `<TextInput` at `from`: everything up to the first `>` outside braces and
 * quotes, with string values and `{…}` expression bodies blanked out — so an
 * `accessibilityLabel=` that only appears inside a string or an expression
 * never counts, and `=>` / `>` inside `{…}` never end the tag.
 */
export function openingTagAttributes(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  let out = '';
  for (let i = from; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = null;
      continue;
    }
    if (depth === 0 && (ch === '"' || ch === "'")) quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return out;
    else if (depth === 0) out += ch;
  }
  return out;
}

/** `path:line` for each `<TextInput …>` element lacking an accessible name. */
export function unlabelledTextInputs(source: string): number[] {
  const lines: number[] = [];
  // `<TextInput` followed by whitespace is an element; `useRef<TextInput>` /
  // `forwardRef<TextInput, …>` (a type argument) is not.
  for (const match of source.matchAll(/<TextInput(?=\s)(?!\s*[|,&])/g)) {
    const start = match.index + match[0].length;
    if (!LABEL_ATTR.test(openingTagAttributes(source, start))) {
      lines.push(source.slice(0, match.index).split('\n').length);
    }
  }
  return lines;
}

describe('openingTagAttributes / unlabelledTextInputs (the scanner itself)', () => {
  it('flags an element with only a placeholder', () => {
    expect(unlabelledTextInputs('<TextInput placeholder="Name" />')).toEqual([1]);
  });

  it('accepts accessibilityLabel / aria-label, even after an arrow function prop', () => {
    const labelled = `<TextInput
      onChangeText={(t) => set(t)}
      placeholder="Name"
      accessibilityLabel="Name"
    />`;
    expect(unlabelledTextInputs(labelled)).toEqual([]);
    expect(unlabelledTextInputs('<TextInput aria-label="Name" />')).toEqual([]);
  });

  it('is not fooled by a label word inside a string value or a type argument', () => {
    expect(unlabelledTextInputs('<TextInput placeholder=" accessibilityLabel=x" />')).toEqual([1]);
    expect(unlabelledTextInputs('const ref = useRef<TextInput>(null);')).toEqual([]);
    expect(unlabelledTextInputs('forwardRef<TextInput, Props>(f)')).toEqual([]);
    expect(unlabelledTextInputs('useRef<TextInput | null>(null)')).toEqual([]);
    expect(unlabelledTextInputs('<TextInput value={`accessibilityLabel=`} />')).toEqual([1]);
  });

  it('reports the line of each offending element', () => {
    const src = ['a', '<TextInput placeholder="x" />', '<TextInput accessibilityLabel="y" />'].join(
      '\n',
    );
    expect(unlabelledTextInputs(src)).toEqual([2]);
  });
});

describe('every <TextInput> has an accessibilityLabel (UX-X-09)', () => {
  const violations = SCANNED.flatMap(sourceFiles).flatMap((file) => {
    const rel = relative(REPO, file);
    return unlabelledTextInputs(readFileSync(file, 'utf8')).map((line) => `${rel}:${line}`);
  });
  // Allow-list entries are `path` (any line) so an unrelated edit that shifts
  // line numbers does not break the guard.
  const files = new Set(violations.map((v) => v.slice(0, v.lastIndexOf(':'))));
  const unexpected = violations.filter((v) => !ALLOW_LIST.includes(v.slice(0, v.lastIndexOf(':'))));

  it('has no unlabelled TextInput outside the allow-list', () => {
    expect(unexpected).toEqual([]);
  });

  it('the allow-list has no stale entries', () => {
    expect(ALLOW_LIST.filter((f) => !files.has(f))).toEqual([]);
  });
});
