import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoImportError } from './errors.js';
import { VideoTranscriber } from './transcript.js';
import type { ISpeechToText, SpeechTranscript } from './whisper.js';
import type { IVideoFetcher, VideoInfo } from './ytdlp.js';

// yt-dlp and Whisper are both mocked: nothing here downloads or transcribes.

const URL = 'https://youtu.be/abcdef123';
const LIMITS = { maxSeconds: 600, maxDownloadBytes: 50 * 1024 * 1024 };

const FULL_CAPTION = `Creamy tomato pasta
- 200 g pasta
- 1 can tomatoes
- 2 cloves garlic
Boil the pasta. Fry the garlic, add the tomatoes and simmer 10 min.`;

const PARTIAL_CAPTION = `Chicken tenders
• 1.5 lbs chicken
• 1/4 cup honey
• 2 garlic cloves`;

const VTT = `WEBVTT

00:00:00.000 --> 00:00:05.000
okay first we bread the chicken tenders in the seasoned flour

00:00:05.000 --> 00:00:09.000
then air fry them at 200 degrees for about twelve minutes`;

const SPOKEN =
  'right so bread the chicken in flour, then into the air fryer at two hundred for twelve minutes and glaze with honey';

function info(overrides: Partial<VideoInfo> = {}): VideoInfo {
  return {
    title: 'Air fryer tenders',
    description: PARTIAL_CAPTION,
    creator: 'chef',
    webpageUrl: 'https://www.youtube.com/watch?v=abcdef123',
    durationSecs: 60,
    thumbnailUrl: null,
    language: 'en',
    isLive: false,
    subtitleLangs: [],
    autoCaptionLangs: ['en-orig', 'en', 'fr'],
    ...overrides,
  };
}

function fetcher(overrides: Partial<IVideoFetcher> = {}): IVideoFetcher {
  return {
    probe: vi.fn().mockResolvedValue(info()),
    fetchSubtitles: vi.fn().mockResolvedValue(VTT),
    downloadAudio: vi.fn().mockResolvedValue({
      data: Buffer.from('mp3'),
      filename: 'speech.mp3',
      mimeType: 'audio/mpeg',
    }),
    ...overrides,
  };
}

function speech(result: Partial<SpeechTranscript> | Error = {}): ISpeechToText {
  return {
    transcribe:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue({
            text: SPOKEN,
            language: 'en',
            segments: [{ text: SPOKEN, noSpeechProb: 0.02 }],
            ...result,
          }),
  };
}

const quiet = () => undefined;

describe('VideoTranscriber — caption first, then subtitles, then Whisper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) stops at a caption that carries the whole recipe', async () => {
    const f = fetcher({ probe: vi.fn().mockResolvedValue(info({ description: FULL_CAPTION })) });
    const s = speech();
    const result = await new VideoTranscriber(f, s, LIMITS, quiet).transcribe(URL);

    expect(result.source).toBe('caption');
    expect(result.transcript).toBeNull();
    expect(result.caption).toBe(FULL_CAPTION);
    expect(f.fetchSubtitles).not.toHaveBeenCalled();
    expect(f.downloadAudio).not.toHaveBeenCalled();
    expect(s.transcribe).not.toHaveBeenCalled();
  });

  it('(b) reads subtitles when the caption is only an ingredient list — no audio download', async () => {
    const f = fetcher();
    const s = speech();
    const result = await new VideoTranscriber(f, s, LIMITS, quiet).transcribe(URL);

    expect(result.source).toBe('subtitles');
    expect(result.transcript).toContain('air fry them at 200 degrees');
    expect(result.caption).toBe(PARTIAL_CAPTION); // rides along
    expect(f.probe).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abcdef123');
    expect(f.fetchSubtitles).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abcdef123', {
      lang: 'en-orig',
      auto: true,
    });
    expect(f.downloadAudio).not.toHaveBeenCalled();
    expect(s.transcribe).not.toHaveBeenCalled();
  });

  it('(c) falls back to Whisper when there are no subtitles', async () => {
    const f = fetcher({ probe: vi.fn().mockResolvedValue(info({ autoCaptionLangs: [] })) });
    const s = speech();
    const result = await new VideoTranscriber(f, s, LIMITS, quiet).transcribe(URL);

    expect(result.source).toBe('speech');
    expect(result.transcript).toBe(SPOKEN);
    expect(f.fetchSubtitles).not.toHaveBeenCalled();
    expect(f.downloadAudio).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abcdef123',
      LIMITS,
    );
    expect(s.transcribe).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'audio/mpeg' }), {
      language: 'en',
    });
  });

  it('(c) falls back to Whisper when fetching subtitles fails or they are empty', async () => {
    for (const fetchSubtitles of [
      vi.fn().mockRejectedValue(new VideoImportError('FAILED', 'HTTP 403')),
      vi.fn().mockResolvedValue('WEBVTT\n\n00:00.000 --> 00:01.000\n[Music]'),
    ]) {
      const result = await new VideoTranscriber(
        fetcher({ fetchSubtitles }),
        speech(),
        LIMITS,
        quiet,
      ).transcribe(URL);
      expect(result.source).toBe('speech');
    }
  });

  it('uses a partial caption on its own when there is no speech', async () => {
    const f = fetcher({ probe: vi.fn().mockResolvedValue(info({ autoCaptionLangs: [] })) });
    const s = speech({ segments: [{ text: 'Thank you.', noSpeechProb: 0.95 }] });
    const result = await new VideoTranscriber(f, s, LIMITS, quiet).transcribe(URL);
    expect(result.source).toBe('caption');
    expect(result.transcript).toBeNull();
  });

  it('uses a partial caption when the speech step fails', async () => {
    const f = fetcher({ probe: vi.fn().mockResolvedValue(info({ autoCaptionLangs: [] })) });
    const s = speech(new VideoImportError('UNAVAILABLE', 'whisper 503'));
    const result = await new VideoTranscriber(f, s, LIMITS, quiet).transcribe(URL);
    expect(result.source).toBe('caption');
  });

  it('skips the speech step entirely when no Whisper endpoint is configured', async () => {
    const f = fetcher({ probe: vi.fn().mockResolvedValue(info({ autoCaptionLangs: [] })) });
    const result = await new VideoTranscriber(f, null, LIMITS, quiet).transcribe(URL);
    expect(result.source).toBe('caption');
    expect(f.downloadAudio).not.toHaveBeenCalled();
  });
});

describe('VideoTranscriber — caps and errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses unsupported links before running yt-dlp', async () => {
    const f = fetcher();
    await expect(
      new VideoTranscriber(f, speech(), LIMITS, quiet).transcribe('https://example.com/v.mp4'),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_SITE' });
    expect(f.probe).not.toHaveBeenCalled();
  });

  it('refuses a video over the duration cap before downloading anything', async () => {
    const f = fetcher({ probe: vi.fn().mockResolvedValue(info({ durationSecs: 601 })) });
    const error = await new VideoTranscriber(f, speech(), LIMITS, quiet)
      .transcribe(URL)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TOO_LONG' });
    expect((error as Error).message).toContain('up to 10 minutes');
    expect(f.fetchSubtitles).not.toHaveBeenCalled();
    expect(f.downloadAudio).not.toHaveBeenCalled();
  });

  it('refuses live streams', async () => {
    const f = fetcher({ probe: vi.fn().mockResolvedValue(info({ isLive: true })) });
    await expect(
      new VideoTranscriber(f, speech(), LIMITS, quiet).transcribe(URL),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_SITE' });
  });

  it('passes a private-video error straight through', async () => {
    const f = fetcher({ probe: vi.fn().mockRejectedValue(new VideoImportError('PRIVATE')) });
    await expect(
      new VideoTranscriber(f, speech(), LIMITS, quiet).transcribe(URL),
    ).rejects.toMatchObject({ code: 'PRIVATE' });
  });

  it('says NO_SPEECH when there is no caption, no subtitles and no speech', async () => {
    const f = fetcher({
      probe: vi.fn().mockResolvedValue(info({ description: '#food', autoCaptionLangs: [] })),
    });
    const s = speech({ segments: [{ text: '♪', noSpeechProb: 0.99 }] });
    await expect(new VideoTranscriber(f, s, LIMITS, quiet).transcribe(URL)).rejects.toMatchObject({
      code: 'NO_SPEECH',
    });
  });

  it('surfaces a too-large audio error when there is no caption to fall back on', async () => {
    const f = fetcher({
      probe: vi.fn().mockResolvedValue(info({ description: '', autoCaptionLangs: [] })),
      downloadAudio: vi.fn().mockRejectedValue(new VideoImportError('TOO_LARGE', 'max-filesize')),
    });
    await expect(
      new VideoTranscriber(f, speech(), LIMITS, quiet).transcribe(URL),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' });
  });

  it('reports a too-long download (no duration in metadata) with the configured cap', async () => {
    const f = fetcher({
      probe: vi
        .fn()
        .mockResolvedValue(info({ description: '', durationSecs: null, autoCaptionLangs: [] })),
      downloadAudio: vi.fn().mockRejectedValue(new VideoImportError('TOO_LONG', 'match-filter')),
    });
    const error = await new VideoTranscriber(f, speech(), { ...LIMITS, maxSeconds: 90 }, quiet)
      .transcribe(URL)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TOO_LONG' });
    expect((error as Error).message).toContain('up to 90 seconds');
  });
});
