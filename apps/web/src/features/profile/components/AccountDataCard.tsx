'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Download, Trash2 } from 'lucide-react';
import { Button, Sheet } from '@chefer/ui';

// ─── Your data ────────────────────────────────────────────────────────────────
// Self-service export and account deletion (audit P0-6, F-PROF-1-1). The
// privacy policy used to point users at a feedback box no admin could read.

export function AccountDataCard() {
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function downloadData() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await utils.user.exportData.fetch();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chefer-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Couldn't prepare your data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-1 font-semibold text-gray-800">Your data</h2>
      <p className="mb-4 text-sm text-gray-600">
        Download everything Chefer stores about you, or delete your account for good.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={() => void downloadData()} disabled={exporting}>
          <Download aria-hidden="true" />
          {exporting ? 'Preparing…' : 'Download my data'}
        </Button>
        <Button
          variant="outline"
          className="border-red-200 text-red-700 hover:bg-red-50"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 aria-hidden="true" />
          Delete account
        </Button>
      </div>
      {exportError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {exportError}
        </p>
      )}
      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const deleteMutation = trpc.user.deleteSelf.useMutation({
    // The session is gone with the account — a full navigation clears every
    // cached query.
    onSuccess: () => window.location.assign('/'),
  });
  const ready = password.length > 0 && confirmText === 'DELETE';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Delete your account?"
      description="This permanently deletes your plans, logs, recipes, workouts and preferences. It can't be undone."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!ready || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate({ password, confirm: 'DELETE' })}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete my account'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 px-5 pb-2">
        <label className="block text-sm font-medium text-gray-800">
          Your password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm font-medium text-gray-800">
          Type DELETE to confirm
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoCapitalize="characters"
            className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 px-3"
          />
        </label>
        {deleteMutation.isError && (
          <p role="alert" className="text-sm text-red-700">
            {deleteMutation.error.message}
          </p>
        )}
      </div>
    </Sheet>
  );
}
