import { prisma, userRepository } from '@chefer/database';
import { weeklyEmailService } from '../application/notifications/weekly-email.service.js';

// ─── Manual trigger for the weekly emails (audit P2-5) ────────────────────────
// Dev/ops only — there is deliberately no API procedure for this. Runs one
// sweep NOW, ignoring the Monday/Sunday schedule but keeping everything else:
// opt-outs, confirmed addresses only, and the per-week send claims (a second
// run for the same user and week is a no-op — delete the email_sends row to
// resend).
//
//   cd apps/api
//   pnpm exec tsx --env-file=.env src/scripts/send-weekly-emails.ts ready  [--user=a@b.c] [--dry-run]
//   pnpm exec tsx --env-file=.env src/scripts/send-weekly-emails.ts recap  [--user=a@b.c] [--dry-run]
//
// --dry-run prints each rendered email (text part) without claiming or sending.
// With EMAIL_MOCK_ENABLED=true (the default) a real run logs to the console.

async function main(): Promise<void> {
  const [kind, ...flags] = process.argv.slice(2);
  if (kind !== 'ready' && kind !== 'recap') {
    console.error('Usage: send-weekly-emails.ts <ready|recap> [--user=email] [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const dryRun = flags.includes('--dry-run');
  const email = flags.find((f) => f.startsWith('--user='))?.slice('--user='.length);

  let userId: string | undefined;
  if (email) {
    const user = await userRepository.findByEmail(email.toLowerCase().trim());
    if (!user) {
      console.error(`No account for ${email}`);
      process.exitCode = 1;
      return;
    }
    if (!user.emailVerified) {
      console.warn(`${email} has no confirmed address — weekly emails skip it.`);
    }
    userId = user.id;
  }

  const now = new Date();
  const options = { dryRun, ...(userId && { userId }) };
  const result =
    kind === 'ready'
      ? await weeklyEmailService.sendWeekReady(now, options)
      : await weeklyEmailService.sendWeeklyRecap(now, options);

  for (const preview of result.previews) {
    console.log(`\n── To: ${preview.to}\n── Subject: ${preview.subject}\n${preview.text}\n`);
  }
  console.log(
    `${kind}: ${result.sent} sent, ${result.skipped} skipped (nothing to say or already sent), ${result.failed} failed${dryRun ? ` — dry run, ${result.previews.length} rendered` : ''}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
