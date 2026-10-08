import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Tester feedback 2026-10-04: "keyboards are not closing automatically after
// finishing entering inputs". Source-scan guard (same idea as the X-09
// accessibilityLabel guard in `a11y-textinput-labels.test.ts`) so the fixes
// cannot regress. Rules, per JSX element:
//
//  1. SINGLE-LINE `<TextInput|Input|PasswordInput>` declares BOTH
//     `returnKeyType` and `onSubmitEditing` (or spreads a props bundle such as
//     `{...DONE_FIELD_PROPS}` / `{...chain.bind(i)}` / `{...NEW_PASSWORD_FIELD_PROPS}`).
//     Return then reads Next/Done/Go/Search and either moves focus, submits or
//     closes the keyboard — never a dead key.
//  2. A raw `<TextInput>` with a number / decimal / phone pad (no Return key on
//     iOS) or `multiline` (Return is a newline) carries an `inputAccessoryViewID`
//     (a `NumericReturnBar` / `useKeyboardDoneBar`). The kit's `Input` adds its
//     own "Done" accessory for both, so it is exempt.
//  3. In a file that has inputs, every vertical `ScrollView` / `FlatList` /
//     `SectionList` sets `keyboardShouldPersistTaps` + `keyboardDismissMode`
//     (`KeyboardAwareScrollView` and `Sheet` default both).
//
// A violation is `path:line`. Allow-list entries are FILES with a reason; the
// test also fails on a stale entry so the list can only shrink.

const REPO = join(__dirname, '..', '..', '..', '..');
const SCANNED = ['apps/mobile/app', 'apps/mobile/src', 'packages/ui-mobile/src'];

const ALLOW_LIST: Readonly<Record<string, string>> = {
  'packages/ui-mobile/src/components/input.tsx':
    'the primitive: owns the defaults (returnKeyType, submitBehavior, Done accessory) and forwards the rest',
  'packages/ui-mobile/src/components/password-input.tsx': 'primitive wrapper around Input',
  'packages/ui-mobile/src/components/search-field.tsx':
    'primitive: returnKeyType="search" + blur-on-submit are built in',
  'apps/mobile/app/chat.tsx':
    'chat composer: Return is a newline and the keyboard stays up between messages; the thread drags to dismiss',
};

const NO_RETURN_KEYBOARDS = ['number-pad', 'decimal-pad', 'numeric', 'phone-pad'];
const INPUT_TAGS = ['TextInput', 'Input', 'PasswordInput'];

function sourceFiles(path: string): string[] {
  const abs = join(REPO, path);
  if (statSync(abs).isFile()) return abs.endsWith('.tsx') ? [abs] : [];
  return readdirSync(abs).flatMap((name) =>
    name === 'node_modules' ? [] : sourceFiles(join(path, name)),
  );
}

/** Raw source of the JSX opening tag starting at `from` (just after `<Name`). */
export function openingTagSource(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  let out = '';
  for (let i = from; i < source.length; i += 1) {
    const ch = source.charAt(i);
    out += ch;
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = null;
      continue;
    }
    if (depth === 0 && (ch === '"' || ch === "'")) quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0 && source[i - 1] !== '=') return out;
  }
  return out;
}

/** Top-level attribute names of an opening tag, plus whether it spreads a props bundle. */
function describeTag(tag: string): { attrs: Set<string>; keyboardType: string; spread: boolean } {
  const attrs = new Set<string>();
  let keyboardType = '';
  let depth = 0;
  let quote: string | null = null;
  let top = '';
  let spread = false;
  for (let i = 0; i < tag.length; i += 1) {
    const ch = tag.charAt(i);
    if (quote) {
      // String values are blanked so a prop name inside one never counts.
      if (ch === quote && tag[i - 1] !== '\\') {
        quote = null;
        if (depth === 0) top += ch;
      }
      continue;
    }
    if (ch === '{') {
      if (
        depth === 0 &&
        /^\s*\.\.\./.test(tag.slice(i + 1)) &&
        !/^\s*\.\.\.props\b/.test(tag.slice(i + 1))
      ) {
        spread = true;
      }
      depth += 1;
      if (depth === 1) top += '{';
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) top += '}';
      continue;
    }
    if (depth > 0) continue;
    if (ch === '"' || ch === "'") quote = ch;
    top += ch;
  }
  for (const m of top.matchAll(/(?:^|\s)([A-Za-z][\w-]*)(?=[=\s/>]|$)/g)) attrs.add(m[1] ?? '');
  const kt = /keyboardType=(?:"([a-z-]+)"|\{'([a-z-]+)'\})/.exec(tag);
  if (kt) keyboardType = kt[1] ?? kt[2] ?? '';
  // A dynamic `keyboardType={cond ? 'decimal-pad' : 'number-pad'}` still counts.
  if (!keyboardType && /keyboardType=\{[^}]*(decimal|number|numeric|phone)-?pad/.test(tag)) {
    keyboardType = 'decimal-pad';
  }
  return { attrs, keyboardType, spread };
}

function isComment(source: string, index: number): boolean {
  const lineStart = source.lastIndexOf('\n', index) + 1;
  return /^\s*(\*|\/\/|\/\*)/.test(source.slice(lineStart, index + 1));
}

export function inputViolations(source: string): { line: number; rule: string }[] {
  const found: { line: number; rule: string }[] = [];
  const tagRe = new RegExp(`<(${INPUT_TAGS.join('|')})(?=\\s)(?!\\s*[|,&])`, 'g');
  for (const match of source.matchAll(tagRe)) {
    if (isComment(source, match.index)) continue;
    const name = match[1] ?? '';
    const tag = openingTagSource(source, match.index + match[0].length);
    const { attrs, keyboardType, spread } = describeTag(tag);
    const line = source.slice(0, match.index).split('\n').length;
    const multiline = attrs.has('multiline');
    const numeric = NO_RETURN_KEYBOARDS.includes(keyboardType);
    if (!multiline && !spread && !(attrs.has('returnKeyType') && attrs.has('onSubmitEditing'))) {
      found.push({ line, rule: 'single-line field needs returnKeyType + onSubmitEditing' });
    }
    if (
      name === 'TextInput' &&
      (multiline || numeric) &&
      !spread &&
      !attrs.has('inputAccessoryViewID')
    ) {
      found.push({ line, rule: 'numeric/multiline TextInput needs inputAccessoryViewID' });
    }
  }
  return found;
}

export function scrollViolations(source: string): number[] {
  const hasInputs = new RegExp(`<(${INPUT_TAGS.join('|')}|SearchField)(?=\\s)`).test(source);
  if (!hasInputs) return [];
  const lines: number[] = [];
  for (const match of source.matchAll(/<(ScrollView|FlatList|SectionList)(?=\s)(?!\s*[|,&])/g)) {
    if (isComment(source, match.index)) continue;
    const { attrs, spread } = describeTag(openingTagSource(source, match.index + match[0].length));
    if (attrs.has('horizontal') || spread) continue;
    if (!attrs.has('keyboardShouldPersistTaps') || !attrs.has('keyboardDismissMode')) {
      lines.push(source.slice(0, match.index).split('\n').length);
    }
  }
  return lines;
}

describe('the scanner itself', () => {
  it('flags a single-line field with no return key / submit handler', () => {
    expect(inputViolations('<Input value={v} onChangeText={set} />')).toHaveLength(1);
    expect(inputViolations('<Input returnKeyType="done" />')).toHaveLength(1);
    expect(inputViolations('<Input onSubmitEditing={go} />')).toHaveLength(1);
  });

  it('accepts returnKeyType + onSubmitEditing, or a props-bundle spread', () => {
    expect(
      inputViolations('<Input returnKeyType="next" onSubmitEditing={() => a.focus()} />'),
    ).toEqual([]);
    expect(inputViolations('<Input {...DONE_FIELD_PROPS} />')).toEqual([]);
    expect(inputViolations('<Input {...chain.bind(0)} />')).toEqual([]);
    // `{...props}` forwarding is NOT a bundle.
    expect(inputViolations('<Input {...props} />')).toHaveLength(1);
  });

  it('is not fooled by a prop name inside a handler body or a string', () => {
    const src = `<Input onChangeText={(t) => { returnKeyType = 1; onSubmitEditing(); }} placeholder="returnKeyType=" />`;
    expect(inputViolations(src)).toHaveLength(1);
  });

  it('requires an accessory on a raw numeric or multiline TextInput, not on Input', () => {
    const done = 'returnKeyType="done" onSubmitEditing={f}';
    expect(inputViolations(`<TextInput keyboardType="decimal-pad" ${done} />`)).toHaveLength(1);
    expect(
      inputViolations(`<TextInput keyboardType="decimal-pad" ${done} inputAccessoryViewID={id} />`),
    ).toEqual([]);
    expect(inputViolations('<TextInput multiline />')).toHaveLength(1);
    expect(inputViolations('<TextInput multiline inputAccessoryViewID={id} />')).toEqual([]);
    expect(inputViolations(`<Input keyboardType="number-pad" ${done} />`)).toEqual([]);
    expect(inputViolations('<Input multiline />')).toEqual([]);
  });

  it('ignores doc comments and type arguments', () => {
    expect(inputViolations(' * <Input value={v} />')).toEqual([]);
    expect(inputViolations('useRef<TextInput>(null); forwardRef<TextInput, P>(f)')).toEqual([]);
  });

  it('flags a vertical list that does not close the keyboard on drag', () => {
    const withInput = '<Input />\n<ScrollView keyboardShouldPersistTaps="handled">';
    expect(scrollViolations(withInput)).toEqual([2]);
    expect(
      scrollViolations(
        '<Input />\n<ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">',
      ),
    ).toEqual([]);
    expect(scrollViolations('<Input />\n<ScrollView horizontal>')).toEqual([]);
    expect(scrollViolations('<ScrollView>')).toEqual([]);
  });
});

describe('keyboard dismissal (tester feedback 2026-10-04)', () => {
  const inputs: string[] = [];
  const scrolls: string[] = [];
  for (const file of SCANNED.flatMap(sourceFiles)) {
    const rel = relative(REPO, file);
    if (rel in ALLOW_LIST) continue;
    const source = readFileSync(file, 'utf8');
    for (const v of inputViolations(source)) inputs.push(`${rel}:${v.line} ${v.rule}`);
    for (const line of scrollViolations(source)) {
      scrolls.push(
        `${rel}:${line} scroll container needs keyboardShouldPersistTaps + keyboardDismissMode`,
      );
    }
  }

  it('every text input has a return key + submit behaviour and a way to dismiss', () => {
    expect(inputs).toEqual([]);
  });

  it('every scrolling form closes the keyboard on drag', () => {
    expect(scrolls).toEqual([]);
  });

  it('the allow-list has no stale entries and every entry says why', () => {
    const stale = Object.keys(ALLOW_LIST).filter((rel) => {
      const source = readFileSync(join(REPO, rel), 'utf8');
      return (
        inputViolations(source).length === 0 &&
        scrollViolations(source).length === 0 &&
        !(ALLOW_LIST[rel] ?? '').includes('primitive')
      );
    });
    expect(stale).toEqual([]);
    expect(Object.values(ALLOW_LIST).every((reason) => reason.length > 10)).toBe(true);
  });
});
