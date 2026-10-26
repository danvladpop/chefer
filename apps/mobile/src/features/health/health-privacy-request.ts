import { useEffect } from 'react';
import { AppState } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { router, usePathname } from 'expo-router';
import { legalHref } from '../legal/legal-docs';

// Health Connect's permission screens link to "Chefer's privacy policy"
// (a Play requirement for every Health Connect app). The link starts the
// `chefer-health` module's HealthRationaleActivity, which brings Chefer forward
// with a pending request (and tells a running app with an event); this opens
// the in-app Privacy Policy for it. Android only; a no-op on binaries without
// the module.

interface CheferHealthModule {
  consumePrivacyRequest(): boolean;
  addListener(event: 'onPrivacyRequest', listener: () => void): { remove(): void };
}

function getModule(): CheferHealthModule | null {
  return requireOptionalNativeModule<CheferHealthModule>('CheferHealth');
}

let waiting = false;

/** Mounted once in the root layout (signed in or out: the policy is public). */
export function useHealthPrivacyRequests(): void {
  const pathname = usePathname();

  useEffect(() => {
    const native = getModule();
    if (!native) return;
    const check = () => {
      if (native.consumePrivacyRequest()) waiting = true;
      if (!waiting) return;
      if (pathname.startsWith('/legal/privacy')) {
        waiting = false;
        return;
      }
      try {
        router.push(legalHref('privacy'));
        waiting = false;
      } catch {
        // Navigator not mounted yet: the next pathname change tries again.
      }
    };
    check();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') check();
    });
    // Coming back from Health Connect's sheet does not always change AppState.
    const request = native.addListener('onPrivacyRequest', check);
    return () => {
      subscription.remove();
      request.remove();
    };
  }, [pathname]);
}
