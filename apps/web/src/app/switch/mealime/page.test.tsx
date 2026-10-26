// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MealimeSwitchPage, { metadata } from './page';

const capture = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ capture }));

afterEach(() => {
  cleanup();
  capture.mockClear();
});

describe('/switch/mealime — a public Mealime alternative page', () => {
  it('has one h1 inside <main id="main">', () => {
    const { container } = render(<MealimeSwitchPage />);
    const main = container.querySelector('main#main');
    expect(main).not.toBeNull();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(main?.querySelector('h1')?.textContent).toBe(
      'A Mealime alternative for your weekly meal plan',
    );
  });

  it('titles itself as an alternative, never as Mealime', () => {
    expect(metadata.title).toBe('A Mealime alternative for weekly meal plans');
    expect(metadata.alternates?.canonical).toBe('/switch/mealime');
  });

  it('says Chefer is not affiliated, and cites the closing notice', () => {
    render(<MealimeSwitchPage />);
    expect(
      screen.getByText(/not affiliated with, endorsed by or sponsored by Mealime/),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'its closing notice' }).getAttribute('href')).toBe(
      'https://www.mealime.com/closing',
    );
  });

  it('lists what carries over and what Chefer adds', () => {
    render(<MealimeSwitchPage />);
    for (const title of [
      'Weekly meal plans',
      'A shopping list sorted by aisle',
      'Cook mode',
      'Diet filters',
      'Allergy-safe for the whole household',
      'Costs in euros or lei',
      'Import recipes from links and videos',
      'A free gym log',
      'Free export, so your data isn’t trapped',
    ]) {
      expect(screen.getByRole('heading', { name: title, level: 3 })).toBeTruthy();
    }
  });

  it('walks through importing a recipe in four steps', () => {
    render(<MealimeSwitchPage />);
    const section = screen.getByRole('region', { name: 'How to move your favourite recipes' });
    const steps = within(section).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
  });

  it('tags both Play badges with the switch-mealime campaign', () => {
    render(<MealimeSwitchPage />);
    const play = screen.getAllByRole('link', { name: 'Get it on Google Play' });
    expect(play).toHaveLength(2);
    for (const link of play) {
      const url = new URL(link.getAttribute('href') ?? '');
      expect(new URLSearchParams(url.searchParams.get('referrer') ?? '').get('utm_campaign')).toBe(
        'switch-mealime',
      );
    }
  });

  it('describes the page, the app and its FAQ in JSON-LD, with no rating', () => {
    const { container } = render(<MealimeSwitchPage />);
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent ?? '{}') as { '@graph': Record<string, unknown>[] };
    const types = data['@graph'].map((node) => node['@type']);
    expect(types).toEqual(['WebPage', 'SoftwareApplication', 'FAQPage']);
    expect(data['@graph'][1]).not.toHaveProperty('aggregateRating');
    expect(data['@graph'][1]).not.toHaveProperty('@context');
    expect(JSON.stringify(data)).not.toMatch(/"Organization"|"Brand"/);
  });

  it('links to itself from the shared site footer', () => {
    render(<MealimeSwitchPage />);
    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByRole('link', { name: 'Switching from Mealime?' }).getAttribute('href'),
    ).toBe('/switch/mealime');
  });

  it('sends switch_page_viewed with its source', () => {
    render(<MealimeSwitchPage />);
    expect(capture).toHaveBeenCalledWith('switch_page_viewed', { source: 'mealime' });
  });
});
