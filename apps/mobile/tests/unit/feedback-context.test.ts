import { renderHook } from '@testing-library/react-native';
import { usePathname } from 'expo-router';
import {
  buildFeedbackContext,
  describeOs,
  errorReportDraft,
  useFeedbackRoute,
} from '../../src/features/feedback/feedback-context';

jest.mock('expo-router', () => ({ usePathname: jest.fn() }));

// UX-PO-05: what a feedback submission carries besides the message.

describe('describeOs', () => {
  it('names the platform and version', () => {
    expect(describeOs('ios', '18.2')).toBe('iOS 18.2');
    expect(describeOs('android', 34)).toBe('Android API 34');
    expect(describeOs('web', '1')).toBe('web 1');
  });
});

describe('buildFeedbackContext', () => {
  it('carries the build line, the OS and the route', () => {
    const context = buildFeedbackContext('/gym/workout');
    expect(context.route).toBe('/gym/workout');
    expect(context.build).toContain('Chefer');
    expect(context.os).toMatch(/\S+ \S+/);
  });

  it('says "unknown" when the route cannot be read', () => {
    expect(buildFeedbackContext(null).route).toBe('unknown');
    expect(buildFeedbackContext('').route).toBe('unknown');
  });
});

describe('errorReportDraft', () => {
  it('pre-fills the error and leaves room for what the user was doing', () => {
    const draft = errorReportDraft(new TypeError('undefined is not an object'));
    expect(draft).toContain('TypeError: undefined is not an object');
    expect(draft.endsWith('What I was doing: ')).toBe(true);
  });

  it('clips a very long error message', () => {
    expect(errorReportDraft(new Error('x'.repeat(5000))).length).toBeLessThan(700);
  });
});

describe('useFeedbackRoute', () => {
  it('reads the pathname, and never throws where the navigation store is missing', async () => {
    jest.mocked(usePathname).mockReturnValue('/today');
    expect((await renderHook(() => useFeedbackRoute())).result.current).toBe('/today');

    jest.mocked(usePathname).mockImplementation(() => {
      throw new Error('no navigation store');
    });
    expect((await renderHook(() => useFeedbackRoute())).result.current).toBeNull();
  });
});
