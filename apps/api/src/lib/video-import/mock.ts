import { parseVideoUrl } from '@chefer/utils';
import { VideoImportError } from './errors.js';
import type { IVideoTranscriber, VideoTranscript } from './transcript.js';

// ─── Mock transcriber (AI_MOCK_ENABLED=true) ─────────────────────────────────
// Mock mode never runs yt-dlp or Whisper: e2e and local dev get a canned
// transcript, keyword-steered by the URL like MockAIService (the URL is copied
// into the text, so the mock extractor's own keywords work too):
//   "private"      → PRIVATE error         "too-long"  → TOO_LONG error
//   "no-speech"    → NO_SPEECH error        "subtitles" → source=subtitles
//   "caption-only" → caption source, ingredient list with no method
//   "satay"/"beef"/"no-recipe" → the mock extractor's fixtures

const SPOKEN = `okay so today we're making a quick weeknight dinner. you need four hundred grams of spaghetti, about six hundred grams of ripe tomatoes, three cloves of garlic, a good glug of olive oil and a handful of basil. cook the pasta in salted water, fry the garlic in the oil, add the tomatoes and let it bubble, then toss everything together with the basil.`;

export class MockVideoTranscriber implements IVideoTranscriber {
  async transcribe(rawUrl: string): Promise<VideoTranscript> {
    const parsed = parseVideoUrl(rawUrl);
    if (!parsed) throw new VideoImportError('UNSUPPORTED_SITE', rawUrl);
    const steer = parsed.url.toLowerCase();
    // Scheme-less, so the caption's link-line filter keeps it (it's the steer).
    const tag = parsed.url.replace(/^https?:\/\//, '');
    if (steer.includes('private')) throw new VideoImportError('PRIVATE', 'mock');
    if (steer.includes('too-long')) throw new VideoImportError('TOO_LONG', 'mock');
    if (steer.includes('no-speech')) throw new VideoImportError('NO_SPEECH', 'mock');

    const base = {
      platform: parsed.platform,
      sourceUrl: parsed.url,
      title: 'Weeknight pasta in 15 minutes',
      creator: 'mock_chef',
      durationSecs: 58,
      thumbnailUrl: null,
    };
    if (steer.includes('caption-only')) {
      return {
        ...base,
        caption: `Ingredients (${tag}):\n400 g spaghetti\n600 g tomatoes\n3 garlic cloves\n3 tbsp olive oil`,
        transcript: null,
        source: 'caption',
      };
    }
    return {
      ...base,
      caption: '#pasta #dinner',
      transcript: `${SPOKEN} (${tag})`,
      source: steer.includes('subtitles') ? 'subtitles' : 'speech',
    };
  }
}
