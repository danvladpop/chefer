import { env } from '../../lib/env.js';
import { CuratedIngestService } from './curated-ingest.service.js';

// Production wiring (kept apart from the service so its unit tests need no env).
export const curatedIngestService = new CuratedIngestService({
  dailyCap: () => env.CURATED_INGEST_DAILY_CAP,
});
