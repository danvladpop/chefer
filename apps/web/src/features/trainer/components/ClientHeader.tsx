import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { COACHING_COPY } from '@chefer/types';
import { cn } from '@chefer/utils';

export type ClientTab = 'routine' | 'workouts' | 'adherence';

/**
 * One client: back to the list, the name (the page's one h1) and the tabs
 * (Routine · Workouts · Adherence). Tabs are links, so each is a real URL.
 */
export function ClientHeader({
  clientId,
  name,
  active,
  confirmLeave,
}: {
  clientId: string;
  name: string;
  active: ClientTab;
  /** The routine editor asks before leaving with unsaved changes; return false to stay. */
  confirmLeave?: () => boolean;
}) {
  const guard = (e: React.MouseEvent) => {
    if (confirmLeave && !confirmLeave()) e.preventDefault();
  };
  const tabs = COACHING_COPY.trainer.tabs;
  const base = `/trainer/${encodeURIComponent(clientId)}`;
  const items: { key: ClientTab; label: string; href: string }[] = [
    { key: 'routine', label: tabs.routine, href: `${base}/routine` },
    { key: 'workouts', label: tabs.workouts, href: base },
    { key: 'adherence', label: tabs.adherence, href: `${base}?tab=adherence` },
  ];
  return (
    <header className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/trainer"
          onClick={guard}
          aria-label={COACHING_COPY.trainer.clients}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 break-words font-serif text-2xl font-bold text-gray-900">{name}</h1>
      </div>
      <nav aria-label={name} className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            onClick={guard}
            aria-current={item.key === active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium',
              item.key === active
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
