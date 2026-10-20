'use client';

import { useId, useState } from 'react';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { ClientList } from '@/features/trainer/components/ClientList';
import { InviteSheet } from '@/features/trainer/components/InviteSheet';
import { InvitesSection } from '@/features/trainer/components/InvitesSection';
import { TrainerRequests } from '@/features/trainer/components/TrainerRequests';
import { trpc } from '@/lib/trpc';
import { Search, UserPlus } from 'lucide-react';
import {
  BOOKING_COPY,
  COACHING_COPY,
  COACHING_LIMITS,
  TRAINER_MODE_COPY,
  TRAINER_MODE_LIMITS,
} from '@chefer/types';
import { Button } from '@chefer/ui';
import { filterClients, sortClients, type ClientSort } from '@chefer/utils';
import { QueryError } from './QueryError';

// ─── Clients (trainer-mode.md §6.4, M1) ───────────────────────────────────────
// Trainer tools' home as a tab root: requests first (Today's "Review" lands
// on #trainer-requests), the capacity line, the client list with search (from
// 8 clients) and sort, and the invites. Notices moved to Today and the
// profile / turn-off to Trainer settings.

const copy = TRAINER_MODE_COPY.clients;

export function TrainerClients() {
  const searchId = useId();
  const sortId = useId();
  const [inviting, setInviting] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ClientSort>('name');
  const clients = trpc.trainer.clients.list.useQuery({ today: localDate() }, { retry: false });

  const rows = clients.data ?? [];
  const searchable = rows.length >= TRAINER_MODE_LIMITS.clientSearchFrom;
  const shown = sortClients(searchable ? filterClients(rows, query) : rows, sort);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-bold text-gray-900">{copy.title}</h1>
          {clients.data && (
            <p className="text-sm text-gray-600" data-testid="trainer-clients-capacity">
              {copy.capacity(rows.length, COACHING_LIMITS.maxActiveClients)}
            </p>
          )}
        </div>
        <Button type="button" className="min-h-11" onClick={() => setInviting(true)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> {COACHING_COPY.trainer.invite}
        </Button>
      </div>

      <TrainerRequests />

      {clients.isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      ) : clients.isError ? (
        <QueryError error={clients.error} onRetry={() => void clients.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.length > 1 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              {searchable && (
                <div className="relative min-w-0 flex-1">
                  <label htmlFor={searchId} className="sr-only">
                    {copy.search}
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <input
                    id={searchId}
                    type="search"
                    value={query}
                    placeholder={copy.search}
                    autoComplete="off"
                    enterKeyHint="search"
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
                  />
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2">
                <label htmlFor={sortId} className="text-sm font-medium text-gray-700">
                  {copy.sortLabel}
                </label>
                <select
                  id={sortId}
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ClientSort)}
                  className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
                >
                  <option value="name">{copy.sortName}</option>
                  <option value="lastWorkout">{copy.sortLastWorkout}</option>
                  <option value="nextBooking">{BOOKING_COPY.today.nextBooking}</option>
                </select>
              </div>
            </div>
          )}
          {rows.length > 0 && shown.length === 0 ? (
            <p
              role="status"
              className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600"
            >
              {copy.searchEmpty(query.trim())}
            </p>
          ) : (
            <ClientList clients={shown} />
          )}
        </div>
      )}

      <InvitesSection />

      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
