import { AiCallType, prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { aiService } from '../../lib/ai/index.js';
import type { MealPhotoEstimate } from '../../lib/ai/index.js';
import { assertMealScanQuota } from '../../lib/quotas.js';

// ─── Meal photo scan (F4 Snap-to-Log) ─────────────────────────────────────────
// One job: entitlement + quota gate, meter the call, run the vision estimate.
// Logging the confirmed meal is a separate step (tracker.logCustomMeal) so an
// estimate the user discards never touches the DailyLog.

export class ScanService {
  /**
   * Analyses one meal photo. Throws TRPCError FORBIDDEN (free tier) or
   * TOO_MANY_REQUESTS (daily scan limit) from the quota gate; the SCAN
   * AiCallLog row is written up front so the quota counts attempts.
   */
  async analyzeMealPhoto(
    user: UserProfile,
    imageBase64: string,
    mimeType: string,
  ): Promise<MealPhotoEstimate> {
    await assertMealScanQuota(user);

    prisma.aiCallLog
      .create({ data: { userId: user.id, callType: AiCallType.SCAN } })
      .catch((err) => console.error('[aiCallLog] Failed to log SCAN call:', err));

    return aiService.analyzeMealPhoto(imageBase64, mimeType);
  }
}

export const scanService = new ScanService();
