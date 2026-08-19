import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('docs/ma');

test('M&A carve-out diligence files exist and stay honest', () => {
  for (const file of [
    'README.md',
    'asset-perimeter.md',
    'one-pager.md',
    'cim-lite.md',
    'buyer-map.md',
    'ip-and-name.md',
    'data-room-index.md',
    'demo-script.md',
    'founder-checklist.md',
    'outreach-emails.md',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }

  const onePager = fs.readFileSync(path.join(root, 'one-pager.md'), 'utf8');
  assert.match(onePager, /0\.1\.0-simulation/);
  assert.match(onePager, /externalActionAllowed = false/);
  assert.match(onePager, /Atlanta LinkedIn consulting practice/);

  const emails = fs.readFileSync(path.join(root, 'outreach-emails.md'), 'utf8');
  assert.match(emails, /investors@fiverr.com/);
  assert.match(emails, /investor@freelancer.com/);
  assert.match(emails, /investor@upwork.com/);
  assert.match(emails, /Fiverr/);
  assert.match(emails, /Freelancer\.com/);
  assert.match(emails, /Upwork/);
  assert.match(emails, /GitHub/);
  assert.match(emails, /OpenAI/);
  assert.match(emails, /Anthropic/);
  assert.match(emails, /IP assignment plus employment/);
  assert.match(emails, /Hold — no public corp-dev alias/);

  const checklist = fs.readFileSync(path.join(root, 'founder-checklist.md'), 'utf8');
  assert.match(checklist, /investors@fiverr.com/);
  assert.match(checklist, /investor@freelancer.com/);
  assert.match(checklist, /da8bb09/);

  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /npm ci/);
  assert.match(ci, /npm run demo/);

  const perimeter = fs.readFileSync(path.join(root, 'asset-perimeter.md'), 'utf8');
  assert.match(perimeter, /Out of perimeter/);
  assert.match(perimeter, /Songforge|Photobeam|The Narrows/);
  assert.match(perimeter, /PR #16|#16/);

  const ip = fs.readFileSync(path.join(root, 'ip-and-name.md'), 'utf8');
  assert.match(ip, /Atlanta/);
  assert.match(ip, /no `LICENSE` file/i);

  const report = fs.readFileSync('verification-report.md', 'utf8');
  assert.match(report, /133\/133/);
  assert.match(report, /57 passed/);
  assert.doesNotMatch(report, /13\/13 passed/);
  assert.match(report, /#10/);
  assert.match(report, /#16/);
  assert.match(report, /#22/);
});
