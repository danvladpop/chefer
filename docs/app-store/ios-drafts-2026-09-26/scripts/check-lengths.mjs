// Checks the App Store field lengths in ../metadata.md against Apple's limits.
// Usage: node docs/app-store/ios/scripts/check-lengths.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const md = readFileSync(fileURLToPath(new URL('../metadata.md', import.meta.url)), 'utf8');

const cell = (label) => md.match(new RegExp(`\\| ${label}[^|]*\\| \`([^\`]+)\``))?.[1];
const block = (heading) =>
  md.match(new RegExp(`### ${heading}[^\\n]*\\n+\`\`\`\\n([\\s\\S]*?)\\n\`\`\``))?.[1];

const fields = [
  ['Name', cell('Name'), 30],
  ['Subtitle', cell('Subtitle'), 30],
  ['Promotional text', block('Promotional text'), 170],
  ['Description', block('Description'), 4000],
  ['Keywords', block('Keywords'), 100],
];

let failed = false;
for (const [name, value, limit] of fields) {
  if (value === undefined) {
    console.log(`?  ${name}: not found`);
    failed = true;
    continue;
  }
  const len = [...value].length;
  const ok = len <= limit;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'}  ${name}: ${len}/${limit}`);
}
process.exit(failed ? 1 : 0);
