import { createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createApproval, createPursuitIntent, hashCanonical, type PreparedApplication } from '@opportunityos/core';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function hmacKey(): Buffer {
  const raw = process.env.PURSUIT_APPROVAL_HMAC_KEY_BASE64;
  if (!raw) throw new Error('PURSUIT_APPROVAL_HMAC_KEY_BASE64 is required');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('PURSUIT_APPROVAL_HMAC_KEY_BASE64 must decode to exactly 32 bytes');
  return key;
}

const applicationPath = required('application');
const expectedPayloadHash = required('confirm-payload-hash');
const accountRef = required('account-ref');
const subject = required('subject');
const expiresAt = required('expires-at');
const approvalId = required('approval-id');
const output = arg('output') ?? '.local/canary-approval.json';

const application = JSON.parse(await readFile(applicationPath, 'utf8')) as PreparedApplication;
if (application.payloadHash !== expectedPayloadHash) throw new Error('Human-confirmed payload hash does not match application payloadHash');
if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new Error('--expires-at must be a future timestamp');

const route = {
  executorType: 'official_api' as const,
  platform: application.targetPlatform,
  accountRef,
  credentialRef: `${application.targetPlatform}-credential:runtime`,
};
const intent = createPursuitIntent(application, route, 'LIVE_AUTHORIZED');
const unsigned = createApproval(intent, { approvalId, subject, expiresAt, signature: '' });
const signatureBody = hashCanonical({
  approvalId: unsigned.approvalId,
  actionId: unsigned.actionId,
  actionType: unsigned.actionType,
  payloadHash: unsigned.payloadHash,
  subject: unsigned.subject,
  expiresAt: unsigned.expiresAt,
});
const signature = createHmac('sha256', hmacKey()).update(signatureBody).digest('hex');
const approval = { ...unsigned, signature };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(approval, null, 2), { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ status: 'APPROVAL_CREATED', approvalId, actionId: approval.actionId, payloadHash: approval.payloadHash, expiresAt, output }, null, 2)}\n`);
