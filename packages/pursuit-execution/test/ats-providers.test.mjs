import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultAtsProviders } from '../src/browser/index.ts';

test('default ATS providers match Ashby, Lever, and Greenhouse URLs only', () => {
  const providers = createDefaultAtsProviders({ resolveArtifact: async () => '/tmp/resume.pdf' });
  assert.equal(providers.find((p) => p.id === 'ashby').matches('https://jobs.ashbyhq.com/acme/123'), true);
  assert.equal(providers.find((p) => p.id === 'lever').matches('https://jobs.lever.co/acme/123'), true);
  assert.equal(providers.find((p) => p.id === 'greenhouse').matches('https://boards.greenhouse.io/acme/jobs/123'), true);
  assert.equal(providers.some((p) => p.matches('https://example.com/jobs/123')), false);
});

test('provider confirmation never fabricates an external application id', async () => {
  const providers = createDefaultAtsProviders({ resolveArtifact: async () => '/tmp/resume.pdf' });
  const provider = providers.find((p) => p.id === 'greenhouse');
  const page = {
    url: () => 'https://boards.greenhouse.io/acme/jobs/123/confirmation',
    locator: () => ({ count: async () => 0, first: () => ({ getAttribute: async () => null, textContent: async () => null }) }),
  };
  assert.equal(await provider.confirm(page), undefined);
});
