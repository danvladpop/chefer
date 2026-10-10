import { AskChefAction } from '../../src/features/shell/add-action';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { TrainScreen } from '../../src/features/shell/train/train-screen';

// New shell: Train (10 Oct redesign, board "Train"). The ongoing workout,
// this week, up next, logging, routines, past workouts, then Exercises and
// Strength and history one tap down. Training settings moved under You.
export default function TrainTab() {
  return (
    <ShellChromeProvider value={{ kind: 'tab-root', title: 'Train', actions: <AskChefAction /> }}>
      <TrainScreen />
    </ShellChromeProvider>
  );
}
