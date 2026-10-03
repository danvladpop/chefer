'use client';

import { useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Download, Trash2 } from 'lucide-react';
import { ACCOUNT_DELETION_COPY as COPY } from '@chefer/types';
import { Button, Sheet, Toast } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

// ─── Your data ────────────────────────────────────────────────────────────────
// Self-service export and account deletion (audit P0-6, F-PROF-1-1). The
// privacy policy used to point users at a feedback box no admin could read.
// T-39.5 (bug B-53): the export is named `chefer-export-YYYY-MM-DD.json`
// (was `chefer-data-...`) and confirms with a snackbar, matching the mobile copy.

function exportFilename(): string {
  return `chefer-export-${new Date().toISOString().slice(0, 10)}.json`;
}

export function AccountDataCard() {
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportReady, setExportReady] = useState(false);
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
      a.download = exportFilename();
      a.click();
      URL.revokeObjectURL(url);
      setExportReady(true);
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
          {COPY.button}
        </Button>
      </div>
      {exportError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {exportError}
        </p>
      )}
      {exportReady && (
        <Toast message="Your export is ready." onClose={() => setExportReady(false)} />
      )}
      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const deleteMutation = trpc.user.deleteSelf.useMutation({
    meta: { silent: true },
    // The session is gone with the account — a full navigation clears every
    // cached query. UX-ACC-11: it lands on sign-in, which confirms the deletion
    // once (`?deleted=1`).
    onSuccess: () => window.location.assign('/login?deleted=1'),
    // UX-ACC-11: the wrong-password error sits under the field; focus it for the retry.
    onError: () => passwordRef.current?.focus(),
  });

  // R-24 (parity with mobile): deleting needs the password, so a signed-in
  // user who forgot it asks for a reset link for their own address right here.
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 5 * 60_000 });
  const email = me.data?.email ?? null;
  const resetMutation = trpc.auth.requestPasswordReset.useMutation({ meta: { silent: true } });
  const ready = password.length > 0 && confirmText.trim().toUpperCase() === COPY.confirmWord;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={COPY.title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            {COPY.cancel}
          </Button>
          <Button
            variant="destructive"
            disabled={!ready || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate({ password, confirm: COPY.confirmWord })}
          >
            {deleteMutation.isPending ? COPY.submitting : COPY.submit}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 px-5 pb-2">
        <div className="space-y-2 text-sm text-gray-700" data-testid="delete-account-summary">
          <p className="font-medium text-gray-900">{COPY.permanent}</p>
          <p>{COPY.listHeading}</p>
          <ul className="list-disc space-y-1 pl-5">
            {COPY.deleted.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-xs text-gray-600">{COPY.backups}</p>
        </div>
        <label className="block text-sm font-medium text-gray-800">
          {COPY.passwordLabel}
          <input
            ref={passwordRef}
            type="password"
            autoComplete="off"
            value={password}
            aria-invalid={deleteMutation.isError ? 'true' : undefined}
            aria-describedby={deleteMutation.isError ? 'delete-account-error' : undefined}
            onChange={(e) => {
              if (deleteMutation.isError) deleteMutation.reset();
              setPassword(e.target.value);
            }}
            className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 px-3"
          />
        </label>
        {deleteMutation.isError && (
          <p
            id="delete-account-error"
            role="alert"
            data-testid="delete-account-error"
            className="text-sm text-red-700"
          >
            {userFacingErrorMessage(deleteMutation.error)}
          </p>
        )}
        {email &&
          (resetMutation.isSuccess ? (
            <p
              role="status"
              className="text-sm text-gray-700"
              data-testid="delete-account-reset-sent"
            >
              {COPY.resetSentTo} {email}. {COPY.resetSentHint}
            </p>
          ) : (
            <button
              type="button"
              data-testid="delete-account-forgot-password"
              disabled={resetMutation.isPending}
              onClick={() => resetMutation.mutate({ email })}
              className="min-h-11 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
            >
              {resetMutation.isPending ? COPY.resetSending : COPY.forgotPassword}
            </button>
          ))}
        {resetMutation.isError && (
          <p role="alert" className="text-sm text-red-700">
            {userFacingErrorMessage(resetMutation.error)}
          </p>
        )}
        <label className="block text-sm font-medium text-gray-800">
          {COPY.confirmLabel}
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoCapitalize="characters"
            className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 px-3"
          />
        </label>
      </div>
    </Sheet>
  );
}
