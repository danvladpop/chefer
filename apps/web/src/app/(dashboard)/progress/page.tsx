import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Progress — Chefer' };

export default function ProgressPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-4xl" aria-hidden="true">
        📈
      </span>
      <div>
        <h2 className="font-serif text-xl font-semibold text-gray-900">Progress</h2>
        <p className="mt-1 text-sm text-gray-500">Coming soon — Phase 3</p>
      </div>
    </div>
  );
}
