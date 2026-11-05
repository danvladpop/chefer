import type { CuratedDraftStatusId } from '@chefer/types';

// ─── Curated ingest queue vocabulary (market review F1) ───────────────────────

export const STATUS_LABEL: Record<CuratedDraftStatusId, string> = {
  EXTRACTING: 'Reading link',
  FAILED: 'Failed',
  DRAFT: 'Needs review',
  APPROVED: 'In the pool',
  REJECTED: 'Rejected',
  UNPUBLISHED: 'Unpublished',
};

export const STATUS_CLASS: Record<CuratedDraftStatusId, string> = {
  EXTRACTING: 'bg-sky-50 text-sky-800',
  FAILED: 'bg-red-50 text-red-700',
  DRAFT: 'bg-amber-50 text-amber-800',
  APPROVED: 'bg-emerald-50 text-emerald-800',
  REJECTED: 'bg-gray-100 text-gray-600',
  UNPUBLISHED: 'bg-gray-100 text-gray-600',
};

/** Queue tabs, in the order an admin works through them. */
export const QUEUE_TABS: { id: string; label: string; statuses: CuratedDraftStatusId[] }[] = [
  { id: 'review', label: 'Needs review', statuses: ['DRAFT'] },
  { id: 'working', label: 'Reading', statuses: ['EXTRACTING'] },
  { id: 'failed', label: 'Failed', statuses: ['FAILED'] },
  { id: 'approved', label: 'In the pool', statuses: ['APPROVED'] },
  { id: 'closed', label: 'Rejected / unpublished', statuses: ['REJECTED', 'UNPUBLISHED'] },
  { id: 'all', label: 'All', statuses: [] },
];

export const PROSE_LABEL: Record<'ORIGINAL' | 'REWRITTEN' | 'EDITED', string> = {
  ORIGINAL: "Creator's words — rewrite before approving",
  REWRITTEN: "Rewritten in Chefer's voice",
  EDITED: 'Edited by an admin',
};
