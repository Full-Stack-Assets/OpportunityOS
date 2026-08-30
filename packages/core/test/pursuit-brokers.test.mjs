import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryCredentialBroker,
  InMemorySessionBroker,
  isOpaqueCredentialRef,
} from '../src/pursuit-brokers.ts';

test('credential broker accepts only opaque references and never exposes secret material', async () => {
  assert.equal(isOpaqueCredentialRef('cred://freelancer/full-stack-assets'), true);
  assert.equal(isOpaqueCredentialRef('Bearer abc123'), false);
  assert.equal(isOpaqueCredentialRef('sk-live-abc123'), false);

  const broker = new InMemoryCredentialBroker([
    {
      ref: 'cred://freelancer/full-stack-assets',
      platform: 'freelancer',
      accountRef: 'acct://freelancer/full-stack-assets',
      kind: 'oauth',
      leaseId: 'lease-1',
      expiresAt: '2026-08-25T00:00:00Z',
    },
  ]);

  const lease = await broker.resolve({
    credentialRef: 'cred://freelancer/full-stack-assets',
    platform: 'freelancer',
    accountRef: 'acct://freelancer/full-stack-assets',
    now: '2026-08-24T16:00:00Z',
  });

  assert.equal(lease.ok, true);
  assert.equal(lease.lease?.leaseId, 'lease-1');
  assert.equal('secret' in (lease.lease ?? {}), false);
  assert.equal('token' in (lease.lease ?? {}), false);
});

test('credential broker fails closed for missing, expired, or account-mismatched credentials', async () => {
  const broker = new InMemoryCredentialBroker([
    {
      ref: 'cred://contra/nic',
      platform: 'contra',
      accountRef: 'acct://contra/nic',
      kind: 'session',
      leaseId: 'lease-contra',
      expiresAt: '2026-08-24T15:00:00Z',
    },
  ]);

  assert.equal((await broker.resolve({ credentialRef: 'cred://missing', platform: 'contra', accountRef: 'acct://contra/nic', now: '2026-08-24T14:00:00Z' })).status, 'AUTH_REQUIRED');
  assert.equal((await broker.resolve({ credentialRef: 'cred://contra/nic', platform: 'contra', accountRef: 'acct://contra/other', now: '2026-08-24T14:00:00Z' })).status, 'ACCOUNT_MISMATCH');
  assert.equal((await broker.resolve({ credentialRef: 'cred://contra/nic', platform: 'contra', accountRef: 'acct://contra/nic', now: '2026-08-24T16:00:00Z' })).status, 'AUTH_REQUIRED');
});

test('session broker maps browser-session health to approved pursuit statuses', async () => {
  const broker = new InMemorySessionBroker([
    { ref: 'session://greenhouse/nic', platform: 'greenhouse', accountRef: 'acct://greenhouse/nic', state: 'ACTIVE', checkedAt: '2026-08-24T16:00:00Z' },
    { ref: 'session://lever/nic', platform: 'lever', accountRef: 'acct://lever/nic', state: 'MFA_REQUIRED', checkedAt: '2026-08-24T16:00:00Z' },
    { ref: 'session://workday/nic', platform: 'workday', accountRef: 'acct://workday/nic', state: 'CAPTCHA_REQUIRED', checkedAt: '2026-08-24T16:00:00Z' },
  ]);

  assert.equal((await broker.inspect({ sessionRef: 'session://greenhouse/nic', platform: 'greenhouse', accountRef: 'acct://greenhouse/nic' })).ok, true);
  assert.equal((await broker.inspect({ sessionRef: 'session://lever/nic', platform: 'lever', accountRef: 'acct://lever/nic' })).status, 'MFA_REQUIRED');
  assert.equal((await broker.inspect({ sessionRef: 'session://workday/nic', platform: 'workday', accountRef: 'acct://workday/nic' })).status, 'CAPTCHA_REQUIRED');
  assert.equal((await broker.inspect({ sessionRef: 'session://missing', platform: 'greenhouse', accountRef: 'acct://greenhouse/nic' })).status, 'AUTH_REQUIRED');
});
