import { describe, expect, it, vi } from 'vitest';
import { GroqWhisperClient } from './whisper.js';

// fetch is injected: no request ever leaves the test.

const CONFIG = {
  apiKey: 'test-key',
  baseUrl: 'https://api.groq.com/openai/v1/',
  model: 'whisper-large-v3-turbo',
};
const AUDIO = { data: Buffer.from('mp3'), filename: 'speech.mp3', mimeType: 'audio/mpeg' };

function respond(status: number, body: unknown) {
  return vi
    .fn()
    .mockResolvedValue(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
}

describe('GroqWhisperClient', () => {
  it('posts the audio as multipart to /audio/transcriptions with verbose_json', async () => {
    const fetchFn = respond(200, {
      text: ' Add two eggs. ',
      language: 'english',
      segments: [{ text: ' Add two eggs.', no_speech_prob: 0.01 }],
    });
    const result = await new GroqWhisperClient(CONFIG, fetchFn).transcribe(AUDIO, {
      language: 'en',
    });

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(init.headers).toEqual({ Authorization: 'Bearer test-key' });
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('language')).toBe('en');
    expect((form.get('file') as File).name).toBe('speech.mp3');
    expect(result).toEqual({
      text: 'Add two eggs.',
      language: 'english',
      segments: [{ text: 'Add two eggs.', noSpeechProb: 0.01 }],
    });
  });

  it('omits a language hint that is not a 2-letter code', async () => {
    const fetchFn = respond(200, { text: 'x' });
    await new GroqWhisperClient(CONFIG, fetchFn).transcribe(AUDIO, { language: 'english' });
    const form = (fetchFn.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(form.get('language')).toBeNull();
  });

  it.each([
    [413, 'TOO_LARGE'],
    [429, 'UNAVAILABLE'],
    [503, 'UNAVAILABLE'],
    [400, 'FAILED'],
  ])('maps HTTP %d to %s', async (status, code) => {
    await expect(
      new GroqWhisperClient(CONFIG, respond(status, 'nope')).transcribe(AUDIO),
    ).rejects.toMatchObject({ code });
  });

  it('maps a timeout to TIMEOUT', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    await expect(new GroqWhisperClient(CONFIG, fetchFn).transcribe(AUDIO)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
});
