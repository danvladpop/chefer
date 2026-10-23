import { useEffect } from 'react';
import { requireOptionalNativeModule } from 'expo';
import * as Linking from 'expo-linking';
import { localDateStr } from '@chefer/utils';
import type { RouterOutputs } from '../../lib/trpc';
import { personalHomeHref } from '../trainer-mode/switch-mode';
import { buildTodayWidgetSnapshot, type TodayWidgetSnapshot } from './today-widget-snapshot';

// Home-screen widget bridge (C4, needs the next store build). The local
// `chefer-widgets` module (apps/mobile/modules/chefer-widgets) stores the
// snapshot where the widget can read it (iOS App Group, Android shared prefs)
// and asks the OS to redraw. OTA JS also runs on older binaries, so the module
// is feature-detected: without it every call is a no-op.

interface CheferWidgetsModule {
  /** JSON snapshot, or null to show the signed-out state. */
  setTodaySnapshot(json: string | null): Promise<void>;
}

let override: CheferWidgetsModule | null | undefined;
let lastWritten: string | null | undefined;

function widgets(): CheferWidgetsModule | null {
  if (override !== undefined) return override;
  return requireOptionalNativeModule<CheferWidgetsModule>('CheferWidgets');
}

async function write(json: string | null): Promise<void> {
  const native = widgets();
  if (!native || json === lastWritten) return;
  lastWritten = json;
  try {
    await native.setTodaySnapshot(json);
  } catch {
    lastWritten = undefined; // try again next time
  }
}

export function writeTodayWidget(snapshot: TodayWidgetSnapshot): Promise<void> {
  return write(JSON.stringify(snapshot));
}

/** Sign-out: the widget must not keep showing the previous account's day. */
export function clearTodayWidget(): Promise<void> {
  return write(null);
}

/** Today screen: keeps the widget in step with every Today load. */
export function useTodayWidgetSync(
  summary: RouterOutputs['dashboard']['summary'] | undefined,
): void {
  useEffect(() => {
    // Old binaries: no module, nothing to build.
    if (!summary || !widgets()) return;
    void writeTodayWidget(
      buildTodayWidgetSnapshot(summary, localDateStr(), Linking.createURL(personalHomeHref())),
    );
  }, [summary]);
}

/** Test seam: a fake module, `null` for an old binary, `undefined` to reset. */
export function setTodayWidgetModuleForTests(fake: CheferWidgetsModule | null | undefined): void {
  override = fake;
  lastWritten = undefined;
}
