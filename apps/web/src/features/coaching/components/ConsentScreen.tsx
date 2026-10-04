import { COACHING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';

// ─── Consent screen (spec §2.3) ───────────────────────────────────────────────
// The legal text of the COACHING_SHARING consent: every line comes from the
// shared COACHING_COPY (mobile renders the same strings). Do not reword here.

export interface ConsentScreenProps {
  trainerName: string;
  /** The client's current trainer, when joining means switching. */
  currentTrainerName: string | null;
  busy: boolean;
  error: string | null;
  onAllow: () => void;
  onDecline: () => void;
}

export function ConsentScreen({
  trainerName,
  currentTrainerName,
  busy,
  error,
  onAllow,
  onDecline,
}: ConsentScreenProps) {
  const copy = COACHING_COPY.consent;
  return (
    <section aria-labelledby="coaching-consent-title" className="flex flex-col gap-5">
      <h1
        id="coaching-consent-title"
        className="font-serif text-2xl font-bold leading-tight text-gray-900"
      >
        {copy.title(trainerName)}
      </h1>

      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            {copy.willSeeHeading(trainerName)}
          </h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {copy.willSee.map((line) => (
              <li key={line} className="min-w-0 break-words">
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-900">{copy.canHeading(trainerName)}</h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {copy.can(trainerName).map((line) => (
              <li key={line} className="min-w-0 break-words">
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-gray-700">{copy.privateNotes(trainerName)}</p>

        <div>
          <h2 className="text-sm font-semibold text-gray-900">{copy.neverHeading(trainerName)}</h2>
          <p className="mt-1.5 text-sm text-gray-700">{copy.never}</p>
        </div>

        <p className="text-sm text-gray-700">{copy.oneTrainer(trainerName)}</p>

        {currentTrainerName && (
          <p
            className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
            data-testid="coaching-switch-line"
          >
            {copy.switchLine(currentTrainerName)}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="button" className="min-h-11 sm:flex-1" onClick={onAllow} loading={busy}>
          {currentTrainerName ? copy.switchTo(trainerName) : copy.allow}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 sm:flex-1"
          onClick={onDecline}
          disabled={busy}
        >
          {copy.notNow}
        </Button>
      </div>
    </section>
  );
}
