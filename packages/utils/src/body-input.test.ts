import { describe, expect, it } from 'vitest';
import {
  bodyFieldTexts,
  cmToFtIn,
  ftInToCm,
  heightCmFromText,
  heightValueForInference,
  parseBodyNumber,
  splitInches,
  weightKgFromText,
} from './body-input';

describe('parseBodyNumber', () => {
  it('reads a decimal comma and rejects empty / non-numbers', () => {
    expect(parseBodyNumber('1,80')).toBe(1.8);
    expect(parseBodyNumber(' 72.5 ')).toBe(72.5);
    expect(parseBodyNumber('')).toBeNull();
    expect(parseBodyNumber('abc')).toBeNull();
  });
});

describe('feet + inches', () => {
  it('splits and joins without drifting', () => {
    expect(cmToFtIn(177.8)).toEqual({ feet: 5, inches: 10 });
    expect(ftInToCm(5, 10)).toBe(177.8);
    expect(splitInches(71.97)).toEqual({ feet: 6, inches: 0 });
    expect(splitInches(59.96)).toEqual({ feet: 5, inches: 0 });
  });
});

describe('heightCmFromText', () => {
  it('metric: the primary field is cm', () => {
    expect(heightCmFromText('175', '', 'METRIC')).toBe(175);
    expect(heightCmFromText('175', '9', 'METRIC')).toBe(175);
    expect(heightCmFromText('', '', 'METRIC')).toBeNull();
  });
  it('imperial: feet + inches, empty inches count as 0', () => {
    expect(heightCmFromText('5', '10', 'IMPERIAL')).toBe(177.8);
    expect(heightCmFromText('6', '', 'IMPERIAL')).toBe(182.9);
    expect(heightCmFromText('', '', 'IMPERIAL')).toBeNull();
  });
  it('keeps the "1,80" typo implausible instead of silently fixing it', () => {
    expect(heightCmFromText('1,80', '', 'METRIC')).toBe(1.8);
  });
});

describe('weightKgFromText', () => {
  it('converts lb when imperial', () => {
    expect(weightKgFromText('75', 'METRIC')).toBe(75);
    expect(weightKgFromText('165', 'IMPERIAL')).toBeCloseTo(74.84, 2);
    expect(weightKgFromText('', 'IMPERIAL')).toBeNull();
  });
});

describe('heightValueForInference', () => {
  it('is cm when metric and total inches when imperial', () => {
    expect(heightValueForInference('170', '', 'METRIC')).toBe(170);
    expect(heightValueForInference('5', '10', 'IMPERIAL')).toBe(70);
  });
  it('reads a feet field of 10+ as centimetres typed into the wrong unit', () => {
    expect(heightValueForInference('170', '', 'IMPERIAL')).toBe(170);
  });
});

describe('bodyFieldTexts', () => {
  it('formats the stored values in the chosen units', () => {
    expect(bodyFieldTexts({ heightCm: 177.8, weightKg: 75 }, 'METRIC')).toEqual({
      heightText: '177.8',
      inchesText: '',
      weightText: '75',
    });
    expect(bodyFieldTexts({ heightCm: 177.8, weightKg: 75 }, 'IMPERIAL')).toEqual({
      heightText: '5',
      inchesText: '10',
      weightText: '165.3',
    });
  });
  it('leaves missing values empty', () => {
    expect(bodyFieldTexts({ heightCm: null, weightKg: null }, 'IMPERIAL')).toEqual({
      heightText: '',
      inchesText: '',
      weightText: '',
    });
  });
});
