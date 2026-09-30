import { Sparkles } from 'lucide-react';
import { AI_GENERATED_A11Y_LABEL, AI_GENERATED_LABEL, isAiGenerated } from '@chefer/types';
import { cn } from '@chefer/utils';

// ─── AI-generated chip (UX-26 §4, T-26.6; EU AI Act Art. 50) ──────────────────
// Web twin of apps/mobile/src/components/ai-generated-chip.tsx (lives in the web app: @chefer/ui does not depend on @chefer/types). Renders nothing
// unless `recipe.aiGenerated === true`.

export function AiGeneratedChip({
  recipe,
  className,
}: {
  recipe: object | null | undefined;
  className?: string;
}) {
  if (!isAiGenerated(recipe)) return null;
  return (
    <span
      data-testid="ai-generated-chip"
      title={AI_GENERATED_A11Y_LABEL}
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
