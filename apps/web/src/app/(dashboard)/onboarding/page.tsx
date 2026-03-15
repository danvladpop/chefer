'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { StepGoal } from '@/features/onboarding/components/step-goal';
import { StepMetrics } from '@/features/onboarding/components/step-metrics';
import { TOTAL_STEPS, type Goal, type WizardData } from '@/features/onboarding/types';

// ─── Wizard Page ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    goal: null,
    age: null,
    heightCm: null,
    weightKg: null,
    activityLevel: null,
  });

  function canContinue(): boolean {
    if (step === 1) return data.goal !== null;
    if (step === 2)
      return (
        data.age !== null &&
        data.age > 0 &&
        data.heightCm !== null &&
        data.heightCm > 0 &&
        data.weightKg !== null &&
        data.weightKg > 0 &&
        data.activityLevel !== null
      );
    return true;
  }

  function handleContinue() {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    }
    // Step TOTAL_STEPS submit is handled in T-011
  }

  function handleBack() {
    if (step > 1) {
      setStep((s) => s - 1);
    } else {
      router.push('/dashboard');
    }
  }

  const progressPct = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* ── Progress bar ── */}
      <div className="border-b bg-background px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Step {step} of {TOTAL_STEPS}
            </span>
            <span>{progressPct}% complete</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={TOTAL_STEPS}
            />
          </div>
        </div>
      </div>

      {/* ── Step content ── */}
      <div className="flex-1 px-4 py-10">
        <div className="mx-auto max-w-2xl">
          {step === 1 && (
            <StepGoal
              value={data.goal}
              onChange={(goal: Goal) => setData((d) => ({ ...d, goal }))}
            />
          )}

          {step === 2 && (
            <StepMetrics
              value={{
                age: data.age,
                heightCm: data.heightCm,
                weightKg: data.weightKg,
                activityLevel: data.activityLevel,
              }}
              onChange={(metrics) => setData((d) => ({ ...d, ...metrics }))}
            />
          )}

          {/* Steps 3–4 are implemented in T-010 / T-011 */}
          {step === 3 && <StepPlaceholder title="Diet & Restrictions" stepNumber={3} />}
          {step === 4 && <StepPlaceholder title="Review & Save" stepNumber={4} />}
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="border-t bg-background px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === TOTAL_STEPS ? 'Finish' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Placeholder (replaced by T-009 / T-010 / T-011) ─────────────────────────

function StepPlaceholder({ title, stepNumber }: { title: string; stepNumber: number }) {
  return (
    <div className="space-y-4 text-center">
      <p className="text-2xl font-bold">{title}</p>
      <p className="text-muted-foreground">
        Step {stepNumber} — coming in a future task.
      </p>
    </div>
  );
}
