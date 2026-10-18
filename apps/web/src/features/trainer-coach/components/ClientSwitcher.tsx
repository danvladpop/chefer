'use client';

import { useRef } from 'react';
import { Check } from 'lucide-react';
import { BOOKING_COPY } from '@chefer/types';
import { pressControl } from '@chefer/ui';
import { cn } from '@chefer/utils';
import type { SwitcherStatus } from '../roster';

export interface SwitcherClient {
  clientId: string;
  /** First name, as on the chip. */
  label: string;
  status: SwitcherStatus;
  /** "3/12 sets" while training. */
  progress: string | null;
}

export const COACH_PANEL_ID = 'coach-panel';
export const coachTabId = (clientId: string) => `coach-tab-${clientId}`;

/**
 * Group booking (§6.7): one chip per client. A real tablist with manual
 * activation — arrow keys / Home / End move focus, Enter or Space opens that
 * client (opening one starts their workout, so focus alone never does). Chips
 * wrap rather than scroll, so six names fit at 320 px.
 */
export function ClientSwitcher({
  clients,
  activeId,
  onSelect,
}: {
  clients: SwitcherClient[];
  activeId: string | null;
  onSelect: (clientId: string) => void;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const move = (from: number, delta: number | 'first' | 'last') => {
    const n = clients.length;
    if (n === 0) return;
    const index = delta === 'first' ? 0 : delta === 'last' ? n - 1 : (((from + delta) % n) + n) % n;
    const target = clients[index];
    if (!target) return;
    refs.current.get(target.clientId)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={BOOKING_COPY.coach.switcherLabel}
      className="mt-2 flex flex-wrap gap-2"
    >
      {clients.map((client, i) => {
        const selected = client.clientId === activeId;
        return (
          <button
            key={client.clientId}
            ref={(el) => {
              if (el) refs.current.set(client.clientId, el);
              else refs.current.delete(client.clientId);
            }}
            type="button"
            role="tab"
            id={coachTabId(client.clientId)}
            aria-selected={selected}
            aria-controls={COACH_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(client.clientId)}
            onKeyDown={(e) => {
              const delta =
                e.key === 'ArrowRight'
                  ? 1
                  : e.key === 'ArrowLeft'
                    ? -1
                    : e.key === 'Home'
                      ? 'first'
                      : e.key === 'End'
                        ? 'last'
                        : null;
              if (delta === null) return;
              e.preventDefault();
              move(i, delta);
            }}
            data-testid={`coach-chip-${client.clientId}`}
            // MO-01 press feedback.
            className={cn(
              'flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-4 text-sm font-medium',
              pressControl,
              selected
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {client.status === 'saved' && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span className="min-w-0 truncate">{client.label}</span>
            {client.progress && (
              <span
                className={cn(
                  'shrink-0 text-xs tabular-nums',
                  selected ? 'text-gray-200' : 'text-gray-500',
                )}
              >
                {client.progress}
              </span>
            )}
            {client.status === 'saved' && <span className="sr-only">, done</span>}
          </button>
        );
      })}
    </div>
  );
}
