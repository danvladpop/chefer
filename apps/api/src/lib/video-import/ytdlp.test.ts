import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { classifyYtDlpError } from './errors.js';
import { toVideoInfo, YtDlpVideoFetcher, type ExecFn } from './ytdlp.js';

// The exec function is injected: these tests never spawn yt-dlp or ffmpeg.
// Fakes write the files the real tools would, so the temp-dir clean-up is real.

const URL = 'https://www.youtube.com/watch?v=abcdef123';

/** The directory yt-dlp was told to write into (the `-o` template's folder). */
function outDir(args: readonly string[]): string {
  const template = args[args.indexOf('-o') + 1];
  if (!template) throw new Error('no -o');
  return dirname(template);
}

describe('toVideoInfo', () => {
  it('maps yt-dlp JSON, listing only tracks that have files', () => {
    const result = toVideoInfo(
      {
        title: ' Pasta ',
        description: 'Recipe below',
        channel: 'Chef',
        duration: 59.6,
        thumbnail: 'https://i.ytimg.com/x.jpg',
        language: 'en',
        subtitles: { en: [{}], live_chat: [{}], fr: [] },
        automatic_captions: { 'en-orig': [{}] },
      },
      URL,
    );
    expect(result).toMatchObject({
      title: 'Pasta',
      creator: 'Chef',
      webpageUrl: URL,
      durationSecs: 60,
      thumbnailUrl: 'https://i.ytimg.com/x.jpg',
      subtitleLangs: ['en'],
      autoCaptionLangs: ['en-orig'],
      isLive: false,
    });
  });
});

describe('YtDlpVideoFetcher', () => {
  it('probes with extractors restricted and the URL after "--"', async () => {
    const exec = vi.fn<Parameters<ExecFn>, ReturnType<ExecFn>>().mockResolvedValue({
      stdout: JSON.stringify({ title: 'Pasta', duration: 30 }),
      stderr: '',
    });
    const result = await new YtDlpVideoFetcher(exec).probe(URL);
    const [bin, args] = exec.mock.calls[0]!;
    expect(bin).toBe('yt-dlp');
    expect(args).toContain('--skip-download');
    expect(args).toContain('--no-playlist');
    expect(args[args.indexOf('--ies') + 1]).toBe('youtube,YoutubeYtBe,TikTok,vm.tiktok,Instagram');
    expect(args.slice(-2)).toEqual(['--', URL]);
    expect(result.durationSecs).toBe(30);
  });

  it('maps a missing binary, a timeout and yt-dlp errors', async () => {
    const fail = (error: object) =>
      new YtDlpVideoFetcher(vi.fn().mockRejectedValue(Object.assign(new Error('x'), error))).probe(
        URL,
      );
    await expect(fail({ code: 'ENOENT' })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(fail({ killed: true, signal: 'SIGTERM' })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await expect(
      fail({ code: 1, stderr: 'ERROR: [youtube] abc: Private video. Sign in if you…' }),
    ).rejects.toMatchObject({ code: 'PRIVATE' });
  });

  it('downloads audio, transcodes it to 16 kHz mono mp3, and deletes the temp dir', async () => {
    let dir = '';
    const exec: ExecFn = vi.fn(async (bin, args) => {
      if (bin === 'yt-dlp') {
        dir = outDir(args);
        await writeFile(`${dir}/source.webm`, 'raw');
      } else {
        expect(args).toEqual(
          expect.arrayContaining(['-vn', '-ac', '1', '-ar', '16000', '-t', '600']),
        );
        await writeFile(args[args.length - 1]!, 'mp3-bytes');
      }
      return { stdout: '', stderr: '' };
    });
    const audio = await new YtDlpVideoFetcher(exec).downloadAudio(URL, {
      maxSeconds: 600,
      maxDownloadBytes: 1000,
    });
    expect(audio.data.toString()).toBe('mp3-bytes');
    expect(audio.mimeType).toBe('audio/mpeg');
    const ytArgs = vi.mocked(exec).mock.calls[0]![1];
    expect(ytArgs[ytArgs.indexOf('--max-filesize') + 1]).toBe('1000');
    expect(ytArgs[ytArgs.indexOf('--match-filter') + 1]).toBe('!is_live & duration <=? 600');
    expect(existsSync(dir)).toBe(false);
  });

  it('reports a filtered (too long) download and still cleans up', async () => {
    let dir = '';
    const exec: ExecFn = vi.fn(async (_bin, args) => {
      dir = outDir(args);
      return {
        stdout: '[youtube] abc: video does not pass filter (duration <=? 600), skipping',
        stderr: '',
      };
    });
    await expect(
      new YtDlpVideoFetcher(exec).downloadAudio(URL, { maxSeconds: 600, maxDownloadBytes: 1 }),
    ).rejects.toMatchObject({ code: 'TOO_LONG' });
    expect(existsSync(dir)).toBe(false);
  });

  it('reports a download over the size cap', async () => {
    const exec: ExecFn = vi.fn(async () => ({
      stdout: '[download] File is larger than max-filesize (9000 bytes > 1000 bytes). Aborting.',
      stderr: '',
    }));
    await expect(
      new YtDlpVideoFetcher(exec).downloadAudio(URL, { maxSeconds: 600, maxDownloadBytes: 1000 }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' });
  });

  it('reads the subtitle file yt-dlp wrote', async () => {
    const exec: ExecFn = vi.fn(async (_bin, args) => {
      await writeFile(`${outDir(args)}/s.en-orig.vtt`, 'WEBVTT\n\n00:00.000 --> 00:01.000\nhi');
      return { stdout: '', stderr: '' };
    });
    const text = await new YtDlpVideoFetcher(exec).fetchSubtitles(URL, {
      lang: 'en-orig',
      auto: true,
    });
    expect(text).toContain('hi');
    const args = vi.mocked(exec).mock.calls[0]![1];
    expect(args).toContain('--write-auto-subs');
    expect(args[args.indexOf('--sub-langs') + 1]).toBe('en-orig');
  });
});

describe('classifyYtDlpError', () => {
  it.each([
    ['ERROR: Unsupported URL: https://example.com', 'UNSUPPORTED_SITE'],
    ['ERROR: [youtube] x: Sign in to confirm you’re not a bot', 'BLOCKED'],
    [
      'ERROR: [Instagram] x: Requested content is not available, rate-limit reached or login required',
      'PRIVATE',
    ],
    ['ERROR: [youtube] x: Video unavailable. This video has been removed', 'NOT_FOUND'],
    ['ERROR: [TikTok] x: HTTP Error 429: Too Many Requests', 'BLOCKED'],
    ['ERROR: something new and strange', 'FAILED'],
  ])('%s → %s', (stderr, code) => {
    expect(classifyYtDlpError(stderr)).toBe(code);
  });
});
