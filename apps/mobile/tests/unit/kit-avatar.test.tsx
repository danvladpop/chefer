import { fireEvent, render, screen } from '@testing-library/react-native';
import { Avatar, AVATAR_COLORS, AVATAR_SIZES } from '@chefer/ui-mobile';
import { avatarColorIndex } from '@chefer/utils';

const HIDDEN = { includeHiddenElements: true };

// Avatar (UX §3.1): initials on a seed-picked warm colour, decorative.

describe('Avatar', () => {
  it('shows the first + last initials', async () => {
    await render(<Avatar name="Maria Pop" seed="u1" testID="av" />);
    expect(screen.getByTestId('av-initials', HIDDEN)).toHaveTextContent('MP');
  });

  it('falls back to ? for an empty name', async () => {
    await render(<Avatar name="" seed="u1" testID="av" />);
    expect(screen.getByTestId('av-initials', HIDDEN)).toHaveTextContent('?');
  });

  it('picks the colour from the seed, deterministically', async () => {
    const expected = AVATAR_COLORS[avatarColorIndex('user-42', AVATAR_COLORS.length)];
    await render(<Avatar name="A B" seed="user-42" testID="a" />);
    expect(screen.getByTestId('a', HIDDEN)).toHaveStyle({ backgroundColor: expected });
    await render(<Avatar name="Zed Q" seed="user-42" testID="b" />);
    expect(screen.getByTestId('b', HIDDEN)).toHaveStyle({ backgroundColor: expected });
  });

  it('has eight warm colours', () => {
    expect(AVATAR_COLORS).toHaveLength(8);
    expect(new Set(AVATAR_COLORS).size).toBe(8);
  });

  it.each([
    ['sm', 32],
    ['md', 40],
    ['lg', 72],
  ] as const)('size %s is %i pt', async (size, pt) => {
    expect(AVATAR_SIZES[size]).toBe(pt);
    await render(<Avatar name="A B" seed="s" size={size} testID="av" />);
    expect(screen.getByTestId('av', HIDDEN)).toHaveStyle({ width: pt, height: pt });
  });

  it('defaults to md (40)', async () => {
    await render(<Avatar name="A B" seed="s" testID="av" />);
    expect(screen.getByTestId('av', HIDDEN)).toHaveStyle({ width: 40, height: 40 });
  });

  it('is not an accessibility element (rows carry the label)', async () => {
    await render(<Avatar name="A B" seed="s" testID="av" />);
    const node = screen.getByTestId('av', HIDDEN);
    expect(node.props.accessible).toBe(false);
    expect(node.props.accessibilityElementsHidden).toBe(true);
  });

  it('renders the photo over the initials when imageUrl is set', async () => {
    await render(<Avatar name="A B" seed="s" imageUrl="https://x.test/a.jpg" testID="av" />);
    expect(screen.getByTestId('av-image', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('av-initials', HIDDEN)).toBeTruthy();
  });

  it('drops the photo and keeps the initials when it fails to load', async () => {
    await render(<Avatar name="A B" seed="s" imageUrl="https://x.test/a.jpg" testID="av" />);
    await fireEvent(screen.getByTestId('av-image', HIDDEN), 'error');
    expect(screen.queryByTestId('av-image', HIDDEN)).toBeNull();
    expect(screen.getByTestId('av-initials', HIDDEN)).toHaveTextContent('AB');
  });

  it('has no photo without an imageUrl', async () => {
    await render(<Avatar name="A B" seed="s" testID="av" />);
    expect(screen.queryByTestId('av-image', HIDDEN)).toBeNull();
  });
});
