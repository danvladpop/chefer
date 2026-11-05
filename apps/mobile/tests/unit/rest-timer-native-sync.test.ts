import { readFileSync } from 'fs';
import { join } from 'path';

// ActivityKit matches the Live Activity's attributes in the app and in the
// widget extension by type name and Codable shape, so the two Swift copies
// must stay identical (C1). Only their KEEP-IN-SYNC comment differs.
const root = join(__dirname, '../..');
const code = (path: string) =>
  readFileSync(join(root, path), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('//'))
    .join('\n');

it('the app and widget copies of RestTimerAttributes are identical', () => {
  expect(code('targets/widgets/RestTimerAttributes.swift')).toBe(
    code('modules/chefer-rest-timer/ios/RestTimerAttributes.swift'),
  );
});
