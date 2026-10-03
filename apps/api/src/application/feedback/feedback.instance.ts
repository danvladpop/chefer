import { feedbackRepository } from '@chefer/database';
import { emailService } from '../../lib/email/index.js';
import { env } from '../../lib/env.js';
import { EmailFeedbackNotifier } from './feedback-notifier.js';
import { FeedbackService } from './feedback.service.js';

// Production wiring (kept apart from the service so its unit tests need no env):
// the existing email path, addressed by FEEDBACK_NOTIFY_EMAIL (unset = no mail).
export const feedbackService = new FeedbackService(
  feedbackRepository,
  new EmailFeedbackNotifier(emailService, env.FEEDBACK_NOTIFY_EMAIL),
);
