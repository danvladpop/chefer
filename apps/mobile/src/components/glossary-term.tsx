import { useState } from 'react';
import { ExplainSheet, Text } from '@chefer/ui-mobile';

// PAT-7 — jargon and the glossary (technical-plan.md §2.7 / synthesis
// 03-ux-design-spec.md §2.7): a jargon term inline in running copy ("RIR",
// "e1RM", "3 × 8–12"…) gets a dotted underline; tapping it opens an
// ExplainSheet with the plain-English definition.
//
// Presentational only, by orchestrator decision (W0-A): the shared
// definition table `packages/utils/src/glossary.ts` is being built in
// parallel by another lane and doesn't exist on this branch yet, so this
// component takes the term and its definition as props instead of importing
// it. The lane that lands glossary.ts wires callers as
// `<GlossaryTerm term={GLOSSARY.rir.term} definition={GLOSSARY.rir.text} />`
// (or similar) without needing to change this file.
//
// Usage: because the trigger renders a `Text` alongside a `Sheet` (which is
// a `Modal`), put it in a `View` "wrapping paragraph" (a flex-row flex-wrap
// of `Text` words), never as a child of a single continuous `Text` — a
// `Modal` is not a valid inline child of `Text` on Android.
//   <View className="flex-row flex-wrap">
//     <Text>Do 3 sets of </Text>
//     <GlossaryTerm term="8–12" definition="…" />
//     <Text> reps.</Text>
//   </View>

export interface GlossaryTermProps {
  /** The word/phrase shown inline with a dotted underline. */
  term: string;
  /** Plain-English definition shown in the sheet. */
  definition: string;
  /** Sheet title; defaults to `term`. */
  title?: string;
  className?: string;
  testID?: string;
}

export function GlossaryTerm({ term, definition, title, className, testID }: GlossaryTermProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* RN's Text has no `hitSlop` prop (unlike Pressable) — a bare inline
        text run can't grow a 44pt hit box without breaking the line's
        flow, so this relies on a little extra padding instead. */}
      <Text
        testID={testID}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${term}, definition`}
        className={className}
        style={{ textDecorationLine: 'underline', textDecorationStyle: 'dotted', padding: 4 }}
      >
        {term}
      </Text>
      <ExplainSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title ?? term}
        sentence={definition}
        rows={[]}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </>
  );
}
