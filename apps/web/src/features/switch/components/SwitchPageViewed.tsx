'use client';

import { useEffect } from 'react';
import { capture } from '@/lib/analytics';
import type { EventMap } from '@chefer/types';

/** Sends `switch_page_viewed` once per page view; renders nothing. */
export function SwitchPageViewed({ source }: EventMap['switch_page_viewed']) {
  useEffect(() => {
    capture('switch_page_viewed', { source });
  }, [source]);
  return null;
}
