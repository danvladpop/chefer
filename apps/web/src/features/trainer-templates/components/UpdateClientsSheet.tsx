'use client';

import { useEffect, useState } from 'react';
import { capture } from '@/lib/analytics';
import { showAppToast } from '@/lib/app-toast';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import type { WorkoutTemplateDto } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import {
  defaultTemplateUpdateSelection,
  templateAssignmentStatus,
  userFacingErrorMessage,
} from '@chefer/utils';

// ─── Update for clients (trainer-mode.md §6.6) ────────────────────────────────
// The template changed after it was assigned: the trainer picks whose copy
// gets this version. Outdated copies start ticked; a copy the client (or the
// trainer) edited since starts unticked and says updating replaces those
// changes; an up-to-date copy cannot be picked.

export function UpdateClientsSheet({
  open,
  onClose,
  template,
}: {
  open: boolean;
  onClose: () => void;
  template: WorkoutTemplateDto;
}) {
  const { t } = useT();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultTemplateUpdateSelection(template.assignments)),
  );
  const [failures, setFailures] = useState<{ clientId: string; text: string }[]>([]);

  // Every opening starts from the defaults for the template as it is now.
  useEffect(() => {
    if (open) {
      setSelected(new Set(defaultTemplateUpdateSelection(template.assignments)));
      setFailures([]);
    }
  }, [open, template.assignments]);

  const update = trpc.trainer.templates.updateClients.useMutation({
    meta: { silent: true },
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.ok).length;
      if (ok > 0) {
        capture('template_clients_updated', { clients: ok });
        showAppToast({
          message: t('trainer.templates.update.done', { count: ok }),
          type: 'success',
        });
      }
      void utils.trainer.templates.get.invalidate({ templateId: template.id });
      void utils.trainer.templates.list.invalidate();
      for (const r of res.results) {
        if (r.ok) void utils.trainer.client.routine.invalidate({ clientId: r.clientId });
      }
      const failed = res.results.flatMap((r) =>
        r.ok
          ? []
          : [
              {
                clientId: r.clientId,
                text: t(`trainer.templates.assign.failureReason.${r.reason}`),
              },
            ],
      );
      if (failed.length === 0) onClose();
      else setFailures(failed);
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });

  const nameOf = (clientId: string) =>
    template.assignments.find((a) => a.clientId === clientId)?.clientName ?? clientId;
  const count = selected.size;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('trainer.templates.update.title')}
      description={t('trainer.templates.update.body')}
      size="md"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={update.isPending}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={count === 0}
            loading={update.isPending}
            onClick={() =>
              update.mutate({ templateId: template.id, clientIds: Array.from(selected) })
            }
          >
            {t('trainer.templates.update.confirm', { count })}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <ul className="flex flex-col" aria-label={t('trainer.templates.update.title')}>
          {template.assignments.map((a) => {
            const state = templateAssignmentStatus(a);
            const disabled = state === 'upToDate';
            const hintId = `update-hint-${a.clientId}-${a.routineDayId}`;
            return (
              <li key={`${a.clientId}-${a.routineDayId}`} data-testid="update-client-row">
                <label className="flex min-h-11 items-start gap-3 py-1.5 text-sm text-gray-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0"
                    checked={!disabled && selected.has(a.clientId)}
                    disabled={disabled}
                    aria-describedby={hintId}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(a.clientId);
                        else next.delete(a.clientId);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block min-w-0 break-words font-medium">
                      {a.clientName} · {a.dayName}
                    </span>
                    <span
                      id={hintId}
                      className={
                        state === 'editedSince'
                          ? 'block text-xs text-amber-800'
                          : 'block text-xs text-gray-500'
                      }
                    >
                      {state === 'upToDate'
                        ? t('trainer.templates.update.upToDate')
                        : state === 'editedSince'
                          ? t('trainer.templates.update.editedSince')
                          : t('trainer.templates.update.olderVersion')}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {failures.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1" data-testid="update-failures">
            {failures.map((f) => (
              <li key={f.clientId} className="min-w-0 break-words text-sm text-red-700">
                {t('trainer.templates.assign.failureLine', {
                  name: nameOf(f.clientId),
                  reason: f.text,
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
