import { Sparkles } from 'lucide-react';
import { AI_GENERATED_A11Y_LABEL, AI_GENERATED_LABEL, isAiGenerated } from '@chefer/types';
import { cn } from '@chefer/utils';

// ─── AI-generated chip (UX-26 §4, T-26.6; EU AI Act Art. 50) ──────────────────
// Web twin of apps/mobile/src/components/ai-generated-chip.tsx (lives in the web app: @chefer/ui does not depend on @chefer/types). Renders nothing
// unless `recipe.aiGenerated === true`.

export function AiGeneratedChip({
  recipe,
  className,
  a11yLabel = AI_GENERATED_A11Y_LABEL,
  testId = 'ai-generated-chip',
  variant = 'chip',
}: {
  /** Anything carrying the optional `aiGenerated` flag (a recipe, or the weekly review). */
  recipe: object | null | undefined;
  className?: string;
  /** Tooltip / spoken label; defaults to the recipe wording. */
  a11yLabel?: string;
  testId?: string;
  /**
   * `icon` (FB7-11): just the small sparkle for a dense meta line. The
   * accessible label still says it; the visible word is dropped.
   */
  variant?: 'chip' | 'icon';
}) {
  if (!isAiGenerated(recipe)) return null;
  if (variant === 'icon') {
    return (
      <span
        data-testid={testId}
        role="img"
        aria-label={a11yLabel}
        title={a11yLabel}
        className={cn('inline-flex shrink-0 items-center text-gray-500', className)}
      >
        <Sparkles className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      data-testid={testId}
      title={a11yLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600',
        className,
      )}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {AI_GENERATED_LABEL}
    </span>
  );
}
