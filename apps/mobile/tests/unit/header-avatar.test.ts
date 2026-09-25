import { initialsFor } from '../../src/components/header-avatar';

jest.mock('../../src/lib/trpc', () => ({ trpc: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('initialsFor', () => {
  it('uses first + last name initials', () => {
    expect(initialsFor({ firstName: 'alice', lastName: 'jones' })).toBe('AJ');
  });
  it('falls back to the display name, then the email', () => {
    expect(initialsFor({ name: 'Dan Vlad Pop' })).toBe('DV');
    expect(initialsFor({ email: 'bob@chefer.dev' })).toBe('B');
    expect(initialsFor({})).toBe('?');
  });
});
