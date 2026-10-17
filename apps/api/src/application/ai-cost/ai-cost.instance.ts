import { aiUsageRepository, userRepository } from '@chefer/database';
import { aiBudget } from '../../lib/ai-budget/index.js';
import { env } from '../../lib/env.js';
import { AiCostService } from './ai-cost.service.js';

// Production wiring (kept apart from the service so its unit tests need no env).
export const aiCostService = new AiCostService({
  usage: aiUsageRepository,
  users: userRepository,
  budget: aiBudget,
  globalDailyLimitUsd: env.AI_GLOBAL_DAILY_USD,
});
