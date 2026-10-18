import { Text } from 'react-native';
import { act } from '@testing-library/react-native';
import { router, Stack, Tabs } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

// Trainer mode (trainer-mode.md §5.2) adds `(trainer)/today` and `(trainer)/you`, whose URLs (`/today`,
// `/you`) other groups already own. expo-router breaks the tie by the group the user is in, then by
// file order: from anywhere but trainer mode, the old URLs must keep meaning Gym Today and personal
// You (every `router.replace('/today')` after a workout, every `/you` fallback). Inside trainer mode
// they mean its own tabs. Code that means trainer mode always says `/(trainer)/…`.

const page = (name: string) =>
  function Page() {
    return <Text>{name}</Text>;
  };

async function renderShells() {
  const result = renderRouter(
    {
      _layout: () => <Stack />,
      '(food)/_layout': () => <Tabs />,
      '(food)/index': page('food-index'),
      '(gym)/_layout': () => <Tabs />,
      '(gym)/today': page('gym-today'),
      '(main)/_layout': () => <Tabs initialRouteName="home" />,
      '(main)/home': page('main-home'),
      '(main)/you': page('main-you'),
      '(trainer)/_layout': () => <Tabs initialRouteName="today" />,
      '(trainer)/today': page('trainer-today'),
      '(trainer)/you': page('trainer-you'),
      'settings/index': page('settings'),
    },
    { initialUrl: '/settings' },
  );
  // This app's testing library renders asynchronously; the router helpers sit on the promise.
  // (Returned wrapped: an async function would unwrap the thenable and drop them.)
  await (result as unknown as Promise<unknown>);
  return { getSegments: () => result.getSegments() };
}

async function go(href: string) {
  await act(() => {
    router.replace(href);
    return Promise.resolve();
  });
}

describe('trainer mode routes', () => {
  it('outside trainer mode, /today and /you keep their old screens', async () => {
    const r = await renderShells();
    await go('/settings');
    await go('/today');
    expect(r.getSegments()).toEqual(['(gym)', 'today']);
    await go('/settings');
    await go('/you');
    expect(r.getSegments()).toEqual(['(main)', 'you']);
    await go('/(main)/home');
    await go('/today');
    expect(r.getSegments()).toEqual(['(gym)', 'today']);
  });

  it('the explicit group opens trainer mode, and inside it the short URLs stay there', async () => {
    const r = await renderShells();
    await go('/(trainer)/today');
    expect(r.getSegments()).toEqual(['(trainer)', 'today']);
    await go('/you');
    expect(r.getSegments()).toEqual(['(trainer)', 'you']);
  });
});
