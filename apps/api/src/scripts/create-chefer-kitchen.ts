import { prisma, socialProfileRepository, userRepository } from '@chefer/database';
import { socialProfileService } from '../application/friends/social-profile.service.js';

// ─── Following: make an account the "Chefer Kitchen" profile (Q-F-8) ──────────
// Owner step (implementation-plan.md §14.3): register the account in the app,
// confirm its email, then run this once. It turns Following on for that
// account as a PUBLIC profile with `featured: true`, which makes it always
// eligible for "Popular" in suggestions. Idempotent: a second run reports
// that there is nothing to do.
//
//   cd apps/api
//   pnpm exec tsx --env-file=.env src/scripts/create-chefer-kitchen.ts --email=<address> [--dry-run]
//
// It goes through SocialProfileService (the same turn-on as the app: the
// display-name word filter, the SOCIAL_SHARING consent row, the recipe filter
// pass), then sets `featured` — the only writer of that column. A forced-
// private account is refused (undo the moderation action first, if you mean to).
//
// --dry-run prints what it would do and writes nothing.

const CONSENT_SOURCE = 'migration'; // a server-side, owner-run change (ConsentEvent.source)

async function main(): Promise<void> {
  const flags = process.argv.slice(2);
  const email = flags
    .find((f) => f.startsWith('--email='))
    ?.slice('--email='.length)
    .trim()
    .toLowerCase();
  const dryRun = flags.includes('--dry-run');
  if (!email) {
    console.error('Usage: create-chefer-kitchen.ts --email=<address> [--dry-run]');
    process.exitCode = 1;
    return;
  }

  const user = await userRepository.findByEmail(email);
  if (!user) {
    console.error(`No account for ${email}. Register it in the app first.`);
    process.exitCode = 1;
    return;
  }
  if (!user.emailVerified) {
    console.warn(`${email} has no confirmed address yet — confirm it in the app (owner step 3).`);
  }

  const profile = await socialProfileRepository.find(user.id);
  if (profile?.forcedPrivateAt) {
    console.error(
      `${email} is forced private by moderation (${profile.forcedPrivateAt.toISOString()}); not changed.`,
    );
    process.exitCode = 1;
    return;
  }

  const prefix = dryRun ? 'Dry run — would ' : 'Going to ';
  if (!profile) {
    const firstName = user.firstName?.trim() ? user.firstName.trim() : 'Chefer';
    const lastName = user.lastName?.trim() ? user.lastName.trim() : 'Kitchen';
    console.log(
      `${prefix}turn on Following for ${email} (${user.id}) as "${firstName} ${lastName}", PUBLIC, featured.`,
    );
    if (dryRun) return;
    // "Chefer …" names are reserved for this profile (F3.1, no impersonation).
    await socialProfileService.activate(
      user.id,
      { visibility: 'PUBLIC', firstName, lastName },
      CONSENT_SOURCE,
      { allowReservedName: true },
    );
    await socialProfileRepository.update(user.id, { featured: true });
    console.log('Done.');
    return;
  }

  if (profile.visibility === 'PUBLIC' && profile.featured) {
    console.log(`${email} (${user.id}) is already PUBLIC and featured. Nothing to do.`);
    return;
  }
  const steps = [
    profile.visibility !== 'PUBLIC' && 'switch it to PUBLIC',
    !profile.featured && 'mark it featured',
  ].filter(Boolean);
  console.log(`${prefix}${steps.join(' and ')} for ${email} (${user.id}).`);
  if (dryRun) return;
  if (profile.visibility !== 'PUBLIC') {
    // The app's own path: consent row, pending requests auto-accepted.
    await socialProfileService.updateSettings(user.id, { visibility: 'PUBLIC' }, CONSENT_SOURCE);
  }
  if (!profile.featured) await socialProfileRepository.update(user.id, { featured: true });
  console.log('Done.');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
