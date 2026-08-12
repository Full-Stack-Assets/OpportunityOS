import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const nextConfig = fs.readFileSync('apps/control-plane/next.config.mjs', 'utf8');
const healthRoute = fs.readFileSync('apps/control-plane/app/api/health/route.ts', 'utf8');
const workflow = fs.readFileSync('.github/workflows/jekyll-gh-pages.yml', 'utf8');

test('GitHub Pages exports the OpportunityOS control plane rather than the repository source tree', () => {
  assert.match(nextConfig, /output:\s*['"]export['"]/);
  assert.match(nextConfig, /basePath/);
  assert.match(nextConfig, /OpportunityOS/);
  assert.match(nextConfig, /trailingSlash:\s*true/);
  assert.match(healthRoute, /dynamic\s*=\s*['"]force-static['"]/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /@opportunityos\/control-plane/);
  assert.match(workflow, /apps\/control-plane\/out/);
  assert.match(workflow, /From Opportunity Discovery/);
  assert.doesNotMatch(workflow, /jekyll-build-pages/);
  assert.doesNotMatch(workflow, /source:\s*\.\//);
});
