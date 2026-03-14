'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { UserProfile } from '@chefer/types';

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

interface UseAuthReturn extends AuthState {
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

/**
 * Hook for accessing and managing authentication state.
 * Fetches the current user session on mount.
 */
export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  const fetchUser = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (response.status === 401) {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: null,
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch user: ${response.statusText}`);
      }

      const data = await response.json() as { user: UserProfile };
      setState({
        user: data.user,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load user';
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: message,
      });
    }
  }, []);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      });

      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout failed:', err);
      // Force redirect even on error
      router.push('/login');
    }
  }, [router]);

  const refreshUser = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  return {
    ...state,
    logout,
    refreshUser,
  };
}
