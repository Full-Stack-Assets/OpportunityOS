import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const files = [
  'economic-pain.ts',
  'commercial-buildgraph.ts',
  'commercial-eligibility.ts',
  'commercial-value.ts',
  'commercial-winability.ts',
  'commercial-priority.ts',
  'opportunity-revalidation.ts',
  'critical-investigation.ts',
];

const forbidden = [
  /method:\s*['"]POST['"]/i,
  /method:\s*['"]PUT['"]/i,
  /method:\s*['"]PATCH['"]/i,
  /method:\s*['"]DELETE['"]/i,
  /send(message|email)/i,
  /submit(bid|proposal|application)/i,
  /accept(contract|project)/i,
  /release(milestone|payment)/i,
  /\bfetch\s*\(/,
];

test('commercial intelligence core contains no provider writes or network calls', () => {
  for (const file of files) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, `${file} violates authority boundary: ${pattern}`);
    }
  }
});
