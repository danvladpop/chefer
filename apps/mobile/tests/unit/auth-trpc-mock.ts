// Shared fake for `src/lib/trpc`, used by the auth-screens RNTL tests
// (F-M-AUTH-3-1 forgot/reset password, confirm + reveal password). Same
// shape/convention as onboarding-trpc-mock.ts.

export { mutationResult } from './onboarding-trpc-mock';

export function createTrpcAuthMock() {
  return {
    trpc: {
      auth: {
        login: { useMutation: jest.fn() },
        register: { useMutation: jest.fn() },
        requestPasswordReset: { useMutation: jest.fn() },
        resetPassword: { useMutation: jest.fn() },
      },
    },
  };
}
