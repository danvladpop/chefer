import { TRAINER_MODE_COPY } from '@chefer/types';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { TrainerYouScreen } from '../../src/features/trainer-mode/you/trainer-you-screen';

// Trainer mode: You (trainer-mode.md §6.8).
export default function TrainerYouTab() {
  return (
    <ShellChromeProvider value={{ kind: 'tab-root', title: TRAINER_MODE_COPY.you.title }}>
      <TrainerYouScreen />
    </ShellChromeProvider>
  );
}
