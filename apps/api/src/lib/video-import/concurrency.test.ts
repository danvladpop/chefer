import { describe, expect, it } from 'vitest';
import { ConcurrencyLimitedTranscriber } from './concurrency.js';
import { VideoImportError } from './errors.js';
import type { IVideoTranscriber, VideoTranscript } from './transcript.js';

const TRANSCRIPT: VideoTranscript = {
  platform: 'youtube',
  sourceUrl: 'https://youtube.com/watch?v=x',
  title: 't',
  creator: null,
  caption: 'c',
  transcript: null,
  source: 'caption',
  durationSecs: 60,
  thumbnailUrl: null,
};

/** A transcriber whose calls finish only when the test says so. */
function controllable() {
  const pending: (() => void)[] = [];
  const inner: IVideoTranscriber = {
    transcribe: () =>
      new Promise<VideoTranscript>((resolve) => pending.push(() => resolve(TRANSCRIPT))),
  };
  return { inner, finishNext: () => pending.shift()?.() };
}

describe('ConcurrencyLimitedTranscriber (Phase 1 guardrails)', () => {
  it('refuses a second import with BUSY while the only slot is taken', async () => {
    const { inner, finishNext } = controllable();
    const gate = new ConcurrencyLimitedTranscriber(inner, 1);

    const first = gate.transcribe('https://youtube.com/watch?v=a');
    const err = await gate.transcribe('https://youtube.com/watch?v=b').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VideoImportError);
    expect((err as VideoImportError).code).toBe('BUSY');
    expect((err as VideoImportError).message).toBe(
      "We're reading another video right now. Try again in a minute, or paste the recipe text instead.",
    );

    finishNext();
    await expect(first).resolves.toBe(TRANSCRIPT);
    expect(gate.running).toBe(0);
  });

  it('frees the slot when an import fails', async () => {
    const failing: IVideoTranscriber = {
      transcribe: () => Promise.reject(new VideoImportError('NOT_FOUND')),
    };
    const gate = new ConcurrencyLimitedTranscriber(failing, 1);
    await expect(gate.transcribe('x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(gate.transcribe('x')).rejects.toMatchObject({ code: 'NOT_FOUND' }); // not BUSY
  });

  it('runs up to `slots` imports at once', async () => {
    const { inner, finishNext } = controllable();
    const gate = new ConcurrencyLimitedTranscriber(inner, 2);
    const a = gate.transcribe('a');
    const b = gate.transcribe('b');
    expect(gate.running).toBe(2);
    await expect(gate.transcribe('c')).rejects.toMatchObject({ code: 'BUSY' });
    finishNext();
    finishNext();
    await Promise.all([a, b]);
  });
});
