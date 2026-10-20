'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { TEMPLATE_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { AssignTemplateSheet } from './AssignTemplateSheet';

/** Client detail's "Assign a template" (trainer-mode.md §6.5): pick a template, this client ticked. */
export function AssignFromClientButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
        <ClipboardList className="h-4 w-4" aria-hidden="true" /> {TEMPLATE_COPY.assign.fromClient}
      </Button>
      <AssignTemplateSheet
        open={open}
        onClose={() => setOpen(false)}
        preselectedClientId={clientId}
      />
    </>
  );
}
