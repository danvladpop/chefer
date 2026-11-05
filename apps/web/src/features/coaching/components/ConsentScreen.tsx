import { COACHING_COPY, COACHING_SHARING_COPY, type CoachingShareChoice } from '@chefer/types';
import { Button } from '@chefer/ui';
import { SharingSwitches } from './SharingSwitches';

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
  /** The heading; defaults to the invite's "Ana wants to coach you in Chefer." */
  title?: string;
  /** The primary button; defaults to "Allow and join" / "Switch to Ana". */
  allowLabel?: string;
  /** Replaces "You'll stop being coached by Ion." when switching (a coaching request says when). */
  switchNote?: string | null;
  /** One more line under the consent text ("Asking doesn't follow them …"). */
  footnote?: string | null;
  /** Lane K1: the food / weight switches (both off until turned on). Omitted = no switches. */
  share?: CoachingShareChoice;
  onShareChange?: (next: Partial<CoachingShareChoice>) => void;
}

export function ConsentScreen({
  trainerName,
  currentTrainerName,
  busy,
  error,
  onAllow,
  onDecline,
  title,
  allowLabel,
  switchNote = null,
  footnote = null,
  share,
  onShareChange,
}: ConsentScreenProps) {
  const copy = COACHING_COPY.consent;
  return (
    <section aria-labelledby="coaching-consent-title" className="flex flex-col gap-5">
      <h1
        id="coaching-consent-title"
        className="font-serif text-2xl font-bold leading-tight text-gray-900"
      >
        {title ?? copy.title(trainerName)}
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
            {switchNote ?? copy.switchLine(currentTrainerName)}
          </p>
        )}
        {footnote && <p className="text-sm text-gray-700">{footnote}</p>}
      </div>

      {share && onShareChange && (
        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold text-gray-900">{COACHING_SHARING_COPY.heading}</h2>
          <SharingSwitches
            testId="coaching-consent-share"
            trainerName={trainerName}
            value={share}
            onChange={onShareChange}
            disabled={busy}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="button" className="min-h-11 sm:flex-1" onClick={onAllow} loading={busy}>
          {allowLabel ?? (currentTrainerName ? copy.switchTo(trainerName) : copy.allow)}
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
