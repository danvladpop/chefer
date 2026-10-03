import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import ts from 'typescript';

// UX-X-04: with the keyboard up, the first tap on a button beside a focused
// field only dismisses the keyboard unless the enclosing scroll view says
// `keyboardShouldPersistTaps="handled"`. `KeyboardAwareScrollView` sets it by
// default; this guard fails on any other scroll view / list that has a text
// input inside it and does not set the prop (or spread props that might).

const MOBILE_ROOT = resolve(__dirname, '../..');
const ROOTS = [
  join(MOBILE_ROOT, 'app'),
  join(MOBILE_ROOT, 'src'),
  resolve(MOBILE_ROOT, '../../packages/ui-mobile/src'),
];

const SCROLL_TAGS = new Set(['ScrollView', 'FlatList', 'SectionList', 'Animated.ScrollView']);
// `KeyboardAwareScrollView` already defaults the prop, so it is not a scroll
// tag here — its own source is covered by the explicit assertion below.
const INPUT_TAGS = new Set(['TextInput', 'Input', 'PasswordInput', 'SearchField', 'FormField']);

/**
 * Offenders OUTSIDE the WP-03 lane-A scope, tracked for the lanes that own
 * those files (lane B: account/onboarding/preferences; lane C: recipe/gym).
 * Shrink this list as they land; never add to it.
 */
const ALLOW_LIST = new Set<string>([
  // Lane C (GYM-35: exercise notes become keyboard-aware).
  'apps/mobile/src/features/gym/library-screens/exercise-detail-screen.tsx',
]);

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(full, out);
    } else if (name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function tagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText();
}

function hasInputInside(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      if (INPUT_TAGS.has(tagName(n))) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

/** Line numbers of scroll views / lists that hold an input but no `keyboardShouldPersistTaps`. */
export function findOffenderLines(text: string): number[] {
  const source = ts.createSourceFile(
    'x.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const lines: number[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const opening = ts.isJsxElement(n) ? n.openingElement : n;
      if (SCROLL_TAGS.has(tagName(opening)) && hasInputInside(n)) {
        const attrs = opening.attributes.properties;
        const ok = attrs.some(
          (a) =>
            ts.isJsxSpreadAttribute(a) ||
            (ts.isJsxAttribute(a) && a.name.getText() === 'keyboardShouldPersistTaps'),
        );
        if (!ok) {
          lines.push(source.getLineAndCharacterOfPosition(n.getStart()).line + 1);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(source);
  return lines;
}

function findOffenders(file: string): string[] {
  const rel = relative(resolve(MOBILE_ROOT, '../..'), file);
  return findOffenderLines(readFileSync(file, 'utf8')).map((line) => `${rel}:${line}`);
}

describe('keyboardShouldPersistTaps guard (UX-X-04)', () => {
  const files = ROOTS.flatMap((root) => walk(root, []));

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('every scroll view / list containing a text input sets keyboardShouldPersistTaps', () => {
    const offenders = files
      .flatMap(findOffenders)
      .filter((o) => !ALLOW_LIST.has(o.replace(/:\d+$/, '')));
    expect(offenders).toEqual([]);
  });

  it('KeyboardAwareScrollView defaults keyboardShouldPersistTaps to "handled"', () => {
    const src = readFileSync(
      resolve(
        MOBILE_ROOT,
        '../../packages/ui-mobile/src/components/keyboard-aware-scroll-view.tsx',
      ),
      'utf8',
    );
    // Default is set before the caller's props are spread, so it can be overridden but never forgotten.
    expect(src).toMatch(/keyboardShouldPersistTaps="handled"\s+automaticallyAdjustKeyboardInsets/);
  });

  it('the detector flags a missing prop and accepts present or spread props', () => {
    expect(findOffenderLines('<ScrollView><TextInput /></ScrollView>')).toEqual([1]);
    expect(
      findOffenderLines('<FlatList data={d} renderItem={() => <Input value="" />} />'),
    ).toEqual([1]);
    expect(
      findOffenderLines(
        '<ScrollView keyboardShouldPersistTaps="handled"><TextInput /></ScrollView>',
      ),
    ).toEqual([]);
    expect(findOffenderLines('<ScrollView {...props}><SearchField /></ScrollView>')).toEqual([]);
    expect(findOffenderLines('<ScrollView><Text>no input</Text></ScrollView>')).toEqual([]);
  });
});
