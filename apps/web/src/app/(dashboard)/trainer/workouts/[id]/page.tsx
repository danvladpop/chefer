import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { TemplateEditor } from '@/features/trainer-templates/components/TemplateEditor';
import { TEMPLATE_COPY } from '@chefer/types';

/** One template, or `/new` for a template created on its first save (trainer-mode.md §6.6, M2). */
export default async function TrainerTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <TrainerModeGate title={TEMPLATE_COPY.editor.title}>
      <TemplateEditor templateId={decodeURIComponent(id)} />
    </TrainerModeGate>
  );
}
