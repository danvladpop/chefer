'use client';

import { useRouter } from 'next/navigation';

import { trpc } from '@/lib/trpc';

/**
 * Hook for accessing and managing authentication state via tRPC.
 */
export function useAuth() {
  const router = useRouter();

  const { data: user, isLoading, refetch } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60 * 1000,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSettled: () => {
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
