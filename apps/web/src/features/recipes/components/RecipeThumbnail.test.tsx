// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecipeThumbnail } from './RecipeThumbnail';

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element -- a plain <img> stands in for next/image
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

afterEach(cleanup);

const thumb = (props: Partial<Parameters<typeof RecipeThumbnail>[0]>) =>
  render(<RecipeThumbnail imageUrl={null} recipeName="Lentil Curry" sizes="56px" {...props} />);

describe('RecipeThumbnail', () => {
  it('renders the photo when the recipe has one', () => {
    const url = 'https://images.unsplash.com/photo-1?w=800';
    thumb({ imageUrl: url });
    const img = screen.getByRole('img', { name: 'Lentil Curry' });
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe(url);
  });

  it.each([null, undefined, ''])(
    'renders the placeholder, not a stock photo, for %j',
    (imageUrl) => {
      const { container } = thumb({ imageUrl });
      expect(container.querySelector('img')).toBeNull();
      const placeholder = screen.getByRole('img', { name: 'Lentil Curry' });
      expect(placeholder.tagName).toBe('DIV');
      expect(screen.queryByText('Photo unavailable')).toBeNull();
    },
  );

  it('fills the box the photo would have filled, with the same classes', () => {
    thumb({ className: 'object-cover opacity-40' });
    const placeholder = screen.getByRole('img', { name: 'Lentil Curry' });
    expect(placeholder.className).toContain('absolute');
    expect(placeholder.className).toContain('inset-0');
    expect(placeholder.className).toContain('opacity-40');
  });

  it.each(['PENDING', 'GENERATING'] as const)('a %s photo shows "preparing"', (imageStatus) => {
    thumb({ imageStatus });
    expect(screen.getByRole('img', { name: 'Preparing photo for Lentil Curry' })).toBeTruthy();
  });

  it('a FAILED photo says it is unavailable', () => {
    thumb({ imageStatus: 'FAILED' });
    expect(screen.getByText('Photo unavailable')).toBeTruthy();
  });

  it('uses the cuisine for the placeholder emoji', () => {
    thumb({ cuisineType: 'Italian' });
    expect(screen.getByText('🍝')).toBeTruthy();
  });
});
