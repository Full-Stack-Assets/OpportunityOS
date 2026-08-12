import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('apps/control-plane/app/page.tsx', 'utf8');

test('approved OpportunityOS discovery-to-verification interface is present', () => {
  assert.match(page, /From Opportunity Discovery to Verified Execution/);
  for (const label of ['Discover', 'Evaluate', 'Approve', 'Execute', 'Verify', 'Close']) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /Active Opportunities/);
  assert.match(page, /Score/);
  assert.match(page, /Status/);
  assert.match(page, /Owner/);
  assert.match(page, /simulation/i);
});

test('preview records and pipeline counts are explicitly non-live', () => {
  assert.match(page, /Interface preview/);
  assert.match(page, /Synthetic pipeline counts/);
  assert.match(page, /Synthetic review data/);
  assert.match(page, /does not widen the authority/i);
  assert.doesNotMatch(page, /live opportunities/i);
});
