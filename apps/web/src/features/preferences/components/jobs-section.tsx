'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StepJobs } from '@/features/onboarding/components/step-jobs';
import { trpc } from '@/lib/trpc';
import type { OnboardingJob } from '@chefer/types';
import { Button } from '@chefer/ui';

// Preferences › "What you use Chefer for" (UX-03, T-03.5/T-04.7 web parity).
// Web equivalent of mobile's app/settings/jobs.tsx — same JobsStep card
// grid (heading suppressed; the page already owns its <h1>), Save footer
// instead of a wizard step. A legacy single-intent account already sees its
// matching job pre-selected here (AC8, via the server's effectiveJobs()).
//
// Adding Train offers "Set up training now?" (→ gym setup); adding a food
// job to a previously gym-only user offers "Set up your food?" (scrolls to
// the diet/goal form above) — mirrors the mobile snackbar affordance with a
// plain inline banner since web has no snackbar primitive here.

export function JobsSection({ initialJobs }: { initialJobs: OnboardingJob[] }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [jobs, setJobs] = useState<OnboardingJob[]>(initialJobs);
  const [originalJobs, setOriginalJobs] = useState<OnboardingJob[]>(initialJobs);
  const [notice, setNotice] = useState<null | { message: string; onAction: () => void }>(null);

  // Re-hydrate if the server data changes underneath us (e.g. after a
  // router.refresh() elsewhere) without clobbering an in-progress edit.
  useEffect(() => {
    setJobs((prev) => (prev === originalJobs ? initialJobs : prev));
    setOriginalJobs(initialJobs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from props only
  }, [initialJobs]);

  const mutation = trpc.preferences.setJobs.useMutation({
    onSuccess: () => {
      void utils.preferences.invalidate();
      const addedTrain = jobs.includes('TRAIN') && !originalJobs.includes('TRAIN');
      const wasGymOnly = originalJobs.length === 1 && originalJobs[0] === 'TRAIN';
      const addedFood = wasGymOnly && jobs.some((j) => j !== 'TRAIN');
      setOriginalJobs(jobs);
      if (addedTrain) {
        setNotice({
          message: 'Set up training now?',
          onAction: () => router.push('/gym/setup'),
        });
      } else if (addedFood) {
        setNotice({
          message: 'Set up your food — a few quick questions below.',
          onAction: () => {
            document.getElementById('main')?.scrollIntoView({ behavior: 'smooth' });
          },
        });
      } else {
        setNotice(null);
      }
    },
  });

  return (
    <section
      aria-labelledby="jobs-section-heading"
      className="mt-8 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 id="jobs-section-heading" className="mb-4 font-semibold text-gray-900">
        What you use Chefer for
      </h2>
      <StepJobs value={jobs} onChange={setJobs} showHeading={false} />
      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#fff3e8] px-3 py-2.5 text-sm text-[#944a00]">
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={notice.onAction}
            className="min-h-11 shrink-0 font-semibold underline-offset-2 hover:underline"
          >
            Set up
          </button>
        </div>
      )}
      <div className="mt-4">
        <Button
          data-testid="jobs-section-save"
          onClick={() => mutation.mutate({ jobs })}
          disabled={jobs.length === 0 || mutation.isPending}
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
        {mutation.isError && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            Couldn&apos;t save that. Try again.
          </p>
        )}
      </div>
    </section>
  );
}
