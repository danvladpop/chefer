'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { identifyUser, resetAnalytics } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';

/**
 * Hook for accessing and managing authentication state via tRPC.
 */
export function useAuth() {
  const router = useRouter();

  const {
    data: user,
    isLoading,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60 * 1000,
  });

  // Ties analytics events to the account (ID only). Covers fresh logins,
  // registrations and returning sessions alike, since they all resolve
  // auth.me on the app shell. identify() is idempotent.
  useEffect(() => {
    if (user?.id) identifyUser(user.id);
  }, [user?.id]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSettled: () => {
      resetAnalytics();
      router.push('/login');
      router.refresh();
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    error: null,
    logout: () => logoutMutation.mutate(),
    refreshUser: () => void refetch(),
  };
}
