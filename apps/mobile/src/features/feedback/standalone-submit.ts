import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@chefer/api';
import { getTrpcUrl } from '../../lib/api-url';
import { getToken } from '../../lib/auth-store';
import { buildTrpcLinks } from '../../lib/trpc-links';
import type { FeedbackContext } from './feedback-context';

// The crash screen replaces the root layout, so it renders OUTSIDE the tRPC /
// React Query providers: "Report this" cannot use `trpc.feedback.submit.useMutation`.
// A plain tRPC client (same links, headers and token as the app) does the one call.

export async function submitFeedbackStandalone(
  message: string,
  context: FeedbackContext,
): Promise<void> {
  const client = createTRPCClient<AppRouter>({
    links: buildTrpcLinks({ url: getTrpcUrl(), getToken }),
  });
  await client.feedback.submit.mutate({ message: message.trim(), ...context });
}
