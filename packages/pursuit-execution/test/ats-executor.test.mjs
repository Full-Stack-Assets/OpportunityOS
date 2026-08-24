import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyAtsField, detectAtsChallenge, GenericAtsPlaywrightDriver } from '../src/browser/index.ts';

test('ATS field classifier separates legal and ordinary fields', () => {
  assert.equal(classifyAtsField({ label: 'Will you now or in the future require sponsorship?', name: 'sponsorship', type: 'radio' }), 'LEGAL_WORK_AUTH');
  assert.equal(classifyAtsField({ label: 'Email', name: 'email', type: 'email', autocomplete: 'email' }), 'CONTACT');
  assert.equal(classifyAtsField({ label: 'Desired salary', name: 'salary', type: 'text' }), 'COMPENSATION');
});

test('ATS challenge detector fails closed for captcha, MFA, and account mismatch', () => {
  assert.equal(detectAtsChallenge({ text: 'Verify you are human', url: 'https://jobs.example/apply' }), 'CAPTCHA_REQUIRED');
  assert.equal(detectAtsChallenge({ text: 'Enter the code sent to your phone', url: 'https://jobs.example/mfa' }), 'MFA_REQUIRED');
  assert.equal(detectAtsChallenge({ text: 'Signed in as other@example.com', url: 'https://jobs.example/apply', expectedAccount: 'nic@example.com', observedAccount: 'other@example.com' }), 'ACCOUNT_MISMATCH');
  assert.equal(detectAtsChallenge({ text: 'Application form', url: 'https://jobs.example/apply', expectedAccount: 'nic@example.com', observedAccount: 'nic@example.com' }), null);
});

test('generic ATS driver inspects without filling or submitting', async () => {
  const calls = [];
  const page = {
    url: () => 'https://jobs.example/apply',
    content: async () => '<form><input name="email" type="email"></form>',
    locator: () => ({
      count: async () => 1,
      nth: () => ({
        evaluate: async () => ({ label: 'Email', name: 'email', type: 'email', autocomplete: 'email', required: true }),
      }),
    }),
  };
  const driver = new GenericAtsPlaywrightDriver({
    open: async () => { calls.push('open'); return page; },
    close: async () => { calls.push('close'); },
  });
  const snapshot = await driver.inspectForm({ platform: 'ats', url: 'https://jobs.example/apply', opportunityId: 'opp-1', accountRef: 'acct://ats/nic' });
  assert.equal(snapshot.fields.length, 1);
  assert.equal(snapshot.fields[0].classification, 'CONTACT');
  assert.deepEqual(calls, ['open', 'close']);
});
