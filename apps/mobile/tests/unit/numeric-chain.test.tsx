import { Keyboard, Platform, type TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Input } from '@chefer/ui-mobile';
import { MetricsStep } from '../../src/features/preferences/components/metrics-step';
import { useNumericChain } from '../../src/features/preferences/use-numeric-chain';

// UX-ONB-06: every numeric field owns its accessory bar (id + fixed label +
// fixed action). A shared id with a label that changed per focused field left
// a dead bar on iOS whose tap fell through and changed the Activity level.

const EMPTY = {
  biologicalSex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
};

async function textInputPrototype(): Promise<TextInput> {
  const holder: { node: TextInput | null } = { node: null };
  await render(
    <Input
      ref={(n) => {
        holder.node = n;
      }}
    />,
  );
  if (!holder.node) throw new Error('no TextInput ref');
  return Object.getPrototypeOf(holder.node) as TextInput;
}

afterEach(() => jest.restoreAllMocks());

/** testID of the field a spied `focus` ran on (the mock TextInput instance carries its props). */
function focusedTestID(focus: jest.SpyInstance, call: number): unknown {
  return (focus.mock.instances[call] as { props: { testID?: string } }).props.testID;
}

describe('MetricsStep numeric bars (UX-ONB-06)', () => {
  function renderStep(onSubmit?: () => void) {
    return render(
      <MetricsStep
        value={EMPTY}
        onChange={jest.fn()}
        ageText=""
        heightText=""
        weightText=""
        onAgeText={jest.fn()}
        onHeightText={jest.fn()}
        onWeightText={jest.fn()}
        {...(onSubmit ? { onSubmit } : {})}
      />,
    );
  }

  it('gives Age, Height and Weight one accessory id each — never a shared one', async () => {
    await renderStep();
    const ids = ['metrics-age', 'metrics-height', 'metrics-weight'].map(
      (id) => screen.getByTestId(id).props.inputAccessoryViewID as string,
    );
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(3);
    // One bar per id, each with a fixed label: Next, Next, Done.
    expect(screen.getByTestId('metrics-step-numeric-bar-0')).toHaveTextContent('Next');
    expect(screen.getByTestId('metrics-step-numeric-bar-1')).toHaveTextContent('Next');
    expect(screen.getByTestId('metrics-step-numeric-bar-2')).toHaveTextContent('Done');
  });

  it('Age → Next → Next → Done: each Next focuses the following field, Done submits', async () => {
    const proto = await textInputPrototype();
    const focus = jest.spyOn(proto, 'focus').mockImplementation(() => undefined);
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const onSubmit = jest.fn();
    await renderStep(onSubmit);

    await fireEvent.press(screen.getByTestId('metrics-step-numeric-bar-0'));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focusedTestID(focus, 0)).toBe('metrics-height');

    await fireEvent.press(screen.getByTestId('metrics-step-numeric-bar-1'));
    expect(focus).toHaveBeenCalledTimes(2);
    expect(focusedTestID(focus, 1)).toBe('metrics-weight');
    expect(onSubmit).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('metrics-step-numeric-bar-2'));
    expect(dismiss).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('the Return key (Android) behaves like the bar: Next on Age, submit on Weight', async () => {
    const proto = await textInputPrototype();
    const focus = jest.spyOn(proto, 'focus').mockImplementation(() => undefined);
    const onSubmit = jest.fn();
    await renderStep(onSubmit);

    await fireEvent(screen.getByTestId('metrics-age'), 'submitEditing');
    expect(focusedTestID(focus, 0)).toBe('metrics-height');
    expect(screen.getByTestId('metrics-age').props.returnKeyType).toBe('next');
    expect(screen.getByTestId('metrics-weight').props.returnKeyType).toBe('done');
    await fireEvent(screen.getByTestId('metrics-weight'), 'submitEditing');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('useNumericChain', () => {
  function Probe() {
    const chain = useNumericChain('probe', 1);
    return (
      <>
        <Input testID="probe-field" {...chain.bind(0)} />
        {chain.bars}
      </>
    );
  }

  it('a single field gets a lone Done bar that only closes the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await render(<Probe />);
    expect(screen.getByTestId('probe-numeric-bar-0')).toHaveTextContent('Done');
    await fireEvent.press(screen.getByTestId('probe-numeric-bar-0'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('does not attach an accessory id on Android (no InputAccessoryView there)', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await render(<Probe />);
      expect(screen.getByTestId('probe-field').props.inputAccessoryViewID).toBeUndefined();
      expect(screen.queryByTestId('probe-numeric-bar-0')).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});
