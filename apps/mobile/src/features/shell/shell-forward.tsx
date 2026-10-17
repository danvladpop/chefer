import { Redirect, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { shellV2PathFor } from './shell-routes';

/**
 * Rendered by the old (food)/(gym) layouts while the new shell is on: sends
 * the visit to the same screen's new home, query params and all (a Stats
 * push carries `tab`/`month`, a plan link its week). `landing` overrides the
 * target for a cold start on "/" that should open Train. Every old tab URL
 * maps (`shellV2PathFor`), so an unmapped pathname means a screen above the
 * old tabs has focus.
 */
export function ShellV2Forward({ landing }: { landing?: Href }) {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const target = landing ?? shellV2PathFor(pathname);
  // A screen pushed over the old tabs (Settings, where the preview switch
  // lives) is focused: redirecting from underneath it would yank it away and
  // leave hardware back with nothing to pop. Wait until the old tab is
  // focused again — Back from Settings then lands on You.
  if (!target) return null;
  return <Redirect href={typeof target === 'string' ? { pathname: target, params } : target} />;
}
