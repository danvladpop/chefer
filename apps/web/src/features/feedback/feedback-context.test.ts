import { describe, expect, it } from 'vitest';
import { describeBrowser, webFeedbackContext } from './feedback-context';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

describe('describeBrowser', () => {
  it('names the browser and the OS', () => {
    expect(describeBrowser(CHROME_MAC)).toBe('Chrome on macOS');
    expect(describeBrowser(SAFARI_IPHONE)).toBe('Safari on iOS');
  });

  it('never returns an empty string', () => {
    expect(describeBrowser('')).toBe('unknown');
    expect(describeBrowser('curl/8')).toBe('curl/8');
  });
});

describe('webFeedbackContext', () => {
  it('attaches the route, OS and build (UX-PO-05)', () => {
    expect(webFeedbackContext('/meal-plan', CHROME_MAC)).toEqual({
      build: 'Chefer web',
      os: 'Chrome on macOS',
      route: '/meal-plan',
    });
  });

  it('omits the route when the pathname is unknown', () => {
    expect(webFeedbackContext(null, CHROME_MAC)).not.toHaveProperty('route');
  });
});
