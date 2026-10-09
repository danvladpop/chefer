import { Redirect, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { shellV2PathFor } from './shell-routes';

/**
 * Rendered by the old (food)/(gym) layouts while the new shell is on: sends
 * the visit to the same screen's new home, query params and all (a Stats
 * push carries `tab`/`month`, a plan link its week). `landing` overrides the
 * target for a cold start on "/" that should open Train.
 */
export function ShellV2Forward({ fallback, landing }: { fallback: Href; landing?: Href }) {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const target = landing ?? shellV2PathFor(pathname) ?? fallback;
  return <Redirect href={typeof target === 'string' ? { pathname: target, params } : target} />;
}
