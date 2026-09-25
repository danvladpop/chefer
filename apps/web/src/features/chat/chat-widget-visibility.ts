// Where the floating chat widget is hidden. The active workout is "sacred"
// (research §5.1): no floating extras over the set rows or the rest timer.
const HIDDEN_PREFIXES = ['/gym/workout'];

/** False on `/gym/workout` and anything under it; true everywhere else. */
export function showChatWidget(pathname: string | null): boolean {
  if (!pathname) return true;
  return !HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
