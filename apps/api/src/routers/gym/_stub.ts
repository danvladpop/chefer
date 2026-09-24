import { TRPCError } from '@trpc/server';

/**
 * Wave-0 placeholder (gym_plan.md G0-6): the procedure exists with its final
 * input schema and output type so clients compile against the real AppRouter;
 * G1-B replaces every call with a service call.
 */
export function notImplemented<T>(name: string): Promise<T> {
  return Promise.reject(
    new TRPCError({ code: 'METHOD_NOT_SUPPORTED', message: `gym.${name} is not implemented yet` }),
  );
}
