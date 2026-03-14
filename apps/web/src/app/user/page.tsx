import { prisma } from '@chefer/database';

import { serverClient } from '../../lib/trpc-server';

export default async function UserPage() {
  const first = await prisma.user.findFirst({ select: { id: true } });

  if (!first) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">No user found. Run the seed script first.</p>
      </main>
    );
  }

  const user = await serverClient.user.getById.query({ id: first.id });

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold">User</h1>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-4">
            <dt className="w-24 font-medium text-muted-foreground">First name</dt>
            <dd>{user.firstName}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 font-medium text-muted-foreground">Last name</dt>
            <dd>{user.lastName}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 font-medium text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 font-medium text-muted-foreground">ID</dt>
            <dd className="font-mono text-xs text-muted-foreground">{user.id}</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
