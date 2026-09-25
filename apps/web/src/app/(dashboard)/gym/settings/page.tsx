'use client';

import { GymExportCard } from '@/features/gym/export/export-button';
import { SettingsView } from '@/features/gym/settings/settings-view';

export default function GymSettingsPage() {
  return (
    <>
      <SettingsView />
      <div className="mx-auto w-full max-w-2xl px-4 pb-6">
        <GymExportCard />
      </div>
    </>
  );
}
