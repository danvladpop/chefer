import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userRepository } from '@chefer/database';
import { AI_CONSENT_REQUIRED_MESSAGE } from '@chefer/types';
import {
  aiConsentMissing,
  AiConsentRequiredCause,
  assertAiConsent,
  rejectWithoutAiConsent,
} from './ai-consent-gate.js';

// R-10 — the server-side half of the AI-data consent (App Store 5.1.2(i)).

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, userRepository: { findAiDataConsentAt: vi.fn() } };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertAiConsent', () => {
  it('passes when the user has consented (enforce on)', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(new Date());
    await expect(assertAiConsent({ userId: 'u1', mode: 'on' })).resolves.toBeUndefined();
    expect(userRepository.findAiDataConsentAt).toHaveBeenCalledWith('u1');
  });

  it('rejects AI_CONSENT_REQUIRED when there is no consent and enforce is on', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(null);
    const err = await assertAiConsent({ userId: 'u1', mode: 'on' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'FORBIDDEN', message: AI_CONSENT_REQUIRED_MESSAGE });
    expect((err as { cause?: unknown }).cause).toBeInstanceOf(AiConsentRequiredCause);
  });

  it('passes without consent when enforce is off, and never reads the database', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(null);
    await expect(assertAiConsent({ userId: 'u1', mode: 'off' })).resolves.toBeUndefined();
    expect(userRepository.findAiDataConsentAt).not.toHaveBeenCalled();
  });

  it('is off where env cannot load (a bare unit test) — the schema default (on) lives in env.ts', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(null);
    await expect(assertAiConsent({ userId: 'u1' })).resolves.toBeUndefined();
  });
});

describe('aiConsentMissing', () => {
  it('is false for a consented user and true for one who revoked', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValueOnce(new Date());
    expect(await aiConsentMissing({ userId: 'u1', mode: 'on' })).toBe(false);
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValueOnce(null);
    expect(await aiConsentMissing({ userId: 'u1', mode: 'on' })).toBe(true);
  });
});

describe('rejectWithoutAiConsent (plain-HTTP endpoints)', () => {
  const makeRes = () => {
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    return res as unknown as Response & typeof res;
  };

  it('answers 403 { error, reason } + the header and returns true without consent', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(null);
    const res = makeRes();
    expect(await rejectWithoutAiConsent(res, { userId: 'u1', mode: 'on' })).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: AI_CONSENT_REQUIRED_MESSAGE,
      reason: 'AI_CONSENT_REQUIRED',
    });
    expect(res.setHeader).toHaveBeenCalledWith('x-ai-consent-required', '1');
  });

  it('writes nothing and returns false for a consented user or when enforce is off', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(new Date());
    const consented = makeRes();
    expect(await rejectWithoutAiConsent(consented, { userId: 'u1', mode: 'on' })).toBe(false);
    expect(consented.status).not.toHaveBeenCalled();

    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(null);
    const off = makeRes();
    expect(await rejectWithoutAiConsent(off, { userId: 'u1', mode: 'off' })).toBe(false);
    expect(off.json).not.toHaveBeenCalled();
  });
});
