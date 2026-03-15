import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

import type { AppRouter } from '@chefer/api';

export const serverClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: process.env['NEXT_PUBLIC_API_URL']
        ? `${process.env['NEXT_PUBLIC_API_URL']}/trpc`
        : 'http://localhost:3001/trpc',
      transformer: superjson,
    }),
  ],
});
