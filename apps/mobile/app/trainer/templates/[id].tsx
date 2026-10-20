import { useLocalSearchParams } from 'expo-router';
import { TemplateEditorScreen } from '../../../src/features/trainer-mode/templates/template-editor-screen';
import { TrainerGate } from '../../../src/features/trainer/components/trainer-gate';

// `/trainer/templates/[id]`: one workout template (trainer-mode.md §6.6). `new` opens an empty one that
// is created on its first save with a name.
export default function TemplateEditorRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const templateId = typeof id === 'string' && id !== '' && id !== 'new' ? id : null;
  return (
    <TrainerGate>
      <TemplateEditorScreen key={templateId ?? 'new'} templateId={templateId} />
    </TrainerGate>
  );
}
