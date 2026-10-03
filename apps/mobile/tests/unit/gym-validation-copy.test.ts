import {
  describeValidationIssues,
  friendlyValidationMessage,
  GENERIC_VALIDATION_MESSAGE,
  gymErrorMessage,
  startingWeightError,
} from '../../src/features/gym/validation-copy';

// UX-GYM-01 / UX-X-06 (gym part): users never read Zod JSON.

const ZOD_JSON = JSON.stringify([
  { code: 'too_big', maximum: 1000, type: 'number', path: ['knownWeightsKg', 'bench'] },
]);

describe('friendlyValidationMessage', () => {
  it('turns a serialised Zod issue list into one plain sentence', () => {
    const text = friendlyValidationMessage(ZOD_JSON);
    expect(text).toContain('1000 kg');
    expect(text).not.toMatch(/too_big|\[\{|maximum/);
  });

  it('falls back to a generic line for JSON it cannot read, and never echoes it', () => {
    expect(friendlyValidationMessage('[{"code":"custom"}]')).toBe(GENERIC_VALIDATION_MESSAGE);
    expect(friendlyValidationMessage('[{"code": broken')).toBe(GENERIC_VALIDATION_MESSAGE);
  });

  it('leaves ordinary prose alone', () => {
    expect(friendlyValidationMessage('Pause not found.')).toBe('Pause not found.');
  });
});

describe('describeValidationIssues', () => {
  it('names the field family that is out of range', () => {
    expect(describeValidationIssues([{ code: 'too_big', path: ['sets', 0, 'reps'] }])).toContain(
      '3600',
    );
    expect(describeValidationIssues([{ code: 'too_big', path: ['exercises'] }])).toContain(
      'too many exercises',
    );
  });
});

describe('gymErrorMessage', () => {
  it('maps a BAD_REQUEST carrying Zod JSON, and keeps the network line for transport errors', () => {
    const bad = Object.assign(new Error(ZOD_JSON), { data: { code: 'BAD_REQUEST' } });
    expect(gymErrorMessage(bad)).toContain('1000 kg');
    expect(gymErrorMessage(new TypeError('Network request failed'))).toMatch(/Can't reach Chefer/);
  });
});

describe('startingWeightError', () => {
  it('accepts empty (skip) and valid values in either unit', () => {
    expect(startingWeightError('', 'KG')).toBeNull();
    expect(startingWeightError('62,5', 'KG')).toBeNull();
    expect(startingWeightError('135', 'LB')).toBeNull();
  });

  it('rejects out-of-range and non-numeric values with the limit in the user unit', () => {
    expect(startingWeightError('4055', 'KG')).toBe('Max 1000 kg.');
    expect(startingWeightError('2300', 'LB')).toBe('Max 2204.6 lb.');
    expect(startingWeightError('0', 'KG')).toMatch(/above 0/);
    expect(startingWeightError('12abc', 'KG')).toBe('Enter a number.');
  });
});
