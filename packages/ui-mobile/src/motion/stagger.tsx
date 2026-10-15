import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import { enterUp } from './enter';

// MO-03 screen entrance (docs/mobile-ux-revamp/motion-premium.md): each
// direct child (fragments are looked through) rises 8 pt and fades in, 30 ms
// apart, capped at 6. With `enabled` false the children render bare — pass
// `useFirstEntrance(key)` so a tab plays it on its first load of the session
// only. `enabled` must not change for the life of the component (it would
// remount the children); `useFirstEntrance` guarantees that.

/**
 * The children with fragments opened up, each with a key from its position
 * in the tree (nulls count), so a conditional card appearing above another
 * never shifts — and remounts — the ones after it.
 */
function flatten(children: ReactNode, prefix = ''): { key: string; node: ReactNode }[] {
  const out: { key: string; node: ReactNode }[] = [];
  let position = 0;
  Children.forEach(children, (child) => {
    const here = `${prefix}${position}`;
    position += 1;
    if (isValidElement(child) && child.type === Fragment) {
      const inner = (child as ReactElement<{ children?: ReactNode }>).props.children;
      out.push(...flatten(inner, `${here}.`));
    } else if (child !== null && child !== undefined && typeof child !== 'boolean') {
      const key = isValidElement(child) && child.key !== null ? `k:${child.key}` : `p:${here}`;
      out.push({ key, node: child });
    }
  });
  return out;
}

export interface StaggerProps {
  enabled: boolean;
  children: ReactNode;
}

export function Stagger({ enabled, children }: StaggerProps) {
  if (!enabled) return <>{children}</>;
  return (
    <>
      {flatten(children).map(({ key, node }, index) => (
        <Animated.View key={key} entering={enterUp(index)}>
          {node}
        </Animated.View>
      ))}
    </>
  );
}
