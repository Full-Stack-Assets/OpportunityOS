import { createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  authorizePursuitAction,
  hashCanonical,
  type Approval,
  type PreparedApplication,
} from '@opportunityos/core';
import {
  FreelancerTrustedGatewayExecutor,
  GenericAtsPlaywrightDriver,
  createPythonFreelancerGatewayTransport,
  detectAtsChallenge,
  inspectFreelancerGateway,
} from '@opportunityos/pursuit-execution';

interface Args { [key: string]: string | undefined }
interface EncryptedRecord { iv: string; tag: string; ciphertext: string }

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith('--')) { out[key] = value; i += 1; }
    else out[key] = 'true';
  }
  return out;
}

function fail(status: string, reason: string, code = 2): never {
  process.stdout.write(`${JSON.stringify({ status, reason, externalSideEffects: 0 }, null, 2)}\n`);
  process.exit(code);
}

function positiveInt(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail('NEEDS_INPUT', `${name} must be a positive integer.`);
  return parsed;
}

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function decodeKey(name: string): Buffer {
  const raw = process.env[name];
  if (!raw) fail('AUTH_REQUIRED', `${name} is not configured.`);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) fail('AUTH_REQUIRED', `${name} must decode to exactly 32 bytes.`);
  return key;
}

async function decryptStorageState(filePath: string): Promise<object> {
  const record = await loadJson<EncryptedRecord>(filePath);
  if (!record?.iv || !record?.tag || !record?.ciphertext) fail('AUTH_REQUIRED', 'Encrypted ATS session file is malformed.');
  const key = decodeKey('PURSUIT_SECRET_KEY_BASE64');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    const body = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]);
    return JSON.parse(body.toString('utf8')) as object;
  } catch {
    fail('AUTH_REQUIRED', 'Encrypted ATS session could not be decrypted.');
  }
}

function approvalSignatureBody(approval: Approval): string {
  return hashCanonical({
    approvalId: approval.approvalId,
    actionId: approval.actionId,
    actionType: approval.actionType,
    payloadHash: approval.payloadHash,
    subject: approval.subject,
    expiresAt: approval.expiresAt,
  });
}

async function verifyCanaryApproval(approval: Approval): Promise<boolean> {
  const key = decodeKey('PURSUIT_APPROVAL_HMAC_KEY_BASE64');
  const expected = createHmac('sha256', key).update(approvalSignatureBody(approval)).digest('hex');
  const supplied = approval.signature.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

function freelancerTransport() {
  return createPythonFreelancerGatewayTransport({
    gatewayScript: path.resolve('connectors/freelancer/trusted_gateway.py'),
    cwd: path.resolve('connectors/freelancer'),
    env: process.env,
  });
}

async function inspectFreelancer(args: Args): Promise<void> {
  const projectId = positiveInt(args['project-id'], '--project-id');
  const result = await inspectFreelancerGateway(freelancerTransport(), projectId);
  if (result.status !== 'success' || result.verified !== true || result.external_side_effects !== 0) {
    fail(result.status.toUpperCase(), result.message ?? 'Freelancer inspect failed.');
  }
  const expectedAccount = process.env.FREELANCER_ACCOUNT_ID;
  if (expectedAccount && result.account_id !== expectedAccount) fail('ACCOUNT_MISMATCH', 'Authenticated Freelancer account does not match configured account.');
  process.stdout.write(`${JSON.stringify({
    status: 'INSPECT_VERIFIED',
    platform: 'freelancer',
    accountRef: result.account_id ? `freelancer-account:${result.account_id}` : undefined,
    projectId: result.project_id,
    title: result.title,
    bidCount: result.bid_count,
    externalSideEffects: 0,
    inspectedAt: new Date().toISOString(),
  }, null, 2)}\n`);
}

async function inspectAts(args: Args): Promise<void> {
  const targetUrl = args['target-url'];
  if (!targetUrl) fail('NEEDS_INPUT', '--target-url is required for ATS inspection.');
  const encryptedPath = process.env.PURSUIT_ATS_STORAGE_STATE_ENC_PATH;
  if (!encryptedPath) fail('AUTH_REQUIRED', 'PURSUIT_ATS_STORAGE_STATE_ENC_PATH is not configured.');
  const storageState = await decryptStorageState(encryptedPath);
  const { chromium } = await import('playwright');
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newContext']>> | undefined;
  const driver = new GenericAtsPlaywrightDriver({
    open: async (url) => {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({ storageState });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      return page;
    },
    close: async () => {
      await context?.close();
      await browser?.close();
    },
  });
  try {
    const snapshot = await driver.inspectForm({ platform: 'ats', url: targetUrl, opportunityId: args['opportunity-id'] ?? 'canary', accountRef: 'ats-account:configured' });
    process.stdout.write(`${JSON.stringify({
      status: 'INSPECT_VERIFIED',
      platform: 'ats',
      targetUrl,
      fieldCount: snapshot.fields.length,
      fields: snapshot.fields.map(({ fieldKey, required, attestationClass, inputType }) => ({ fieldKey, required, attestationClass, inputType })),
      externalSideEffects: 0,
      inspectedAt: new Date().toISOString(),
    }, null, 2)}\n`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'ATS inspection failed.';
    if (['CAPTCHA_REQUIRED', 'MFA_REQUIRED', 'ACCOUNT_MISMATCH', 'SESSION_EXPIRED'].includes(reason)) fail(reason, reason);
    fail('FAILED', reason);
  }
}

function runFixture(args: Args): void {
  const fixture = args.fixture;
  const snapshots: Record<string, Parameters<typeof detectAtsChallenge>[0]> = {
    captcha: { text: 'Verify you are human', url: 'https://jobs.example/apply' },
    mfa: { text: 'Enter the verification code sent to your phone', url: 'https://jobs.example/mfa' },
    'account-mismatch': { text: 'Application', url: 'https://jobs.example/apply', expectedAccount: 'expected@example.com', observedAccount: 'other@example.com' },
  };
  if (!fixture || !snapshots[fixture]) fail('NEEDS_INPUT', 'Known --fixture is required.');
  const status = detectAtsChallenge(snapshots[fixture]);
  process.stdout.write(`${JSON.stringify({ status, fixture, externalSideEffects: 0 }, null, 2)}\n`);
}

async function executeFreelancer(args: Args): Promise<void> {
  const applicationPath = args.application;
  const approvalPath = args.approval;
  if (!applicationPath || !approvalPath) fail('NEEDS_HUMAN_AUTH', '--application and --approval are required for live-authorized canary execution.');
  if (process.env.FREELANCER_LIVE_WRITES_ENABLED !== 'true') fail('NEEDS_HUMAN_AUTH', 'FREELANCER_LIVE_WRITES_ENABLED must be explicitly true for the selected canary.');
  const application = await loadJson<PreparedApplication>(applicationPath);
  const approval = await loadJson<Approval>(approvalPath);
  const route = {
    executorType: 'official_api' as const,
    platform: 'freelancer',
    accountRef: process.env.FREELANCER_ACCOUNT_ID ? `freelancer-account:${process.env.FREELANCER_ACCOUNT_ID}` : 'freelancer-account:unverified',
    credentialRef: 'freelancer-credential:runtime',
  };
  const authorization = await authorizePursuitAction(application, approval, route, 'LIVE_AUTHORIZED', new Date().toISOString(), verifyCanaryApproval);
  if (!authorization.authorized) fail('NEEDS_HUMAN_AUTH', authorization.reason);
  process.stderr.write(`Authorized idempotency key: ${authorization.action.idempotencyKey}\n`);
  const executor = new FreelancerTrustedGatewayExecutor(freelancerTransport());
  const execution = await executor.execute(authorization.action);
  if (execution.status !== 'EXECUTED_UNVERIFIED' && execution.status !== 'ALREADY_SUBMITTED') {
    process.stdout.write(`${JSON.stringify({ ...execution, verified: false }, null, 2)}\n`);
    process.exit(3);
  }
  const verification = await executor.verify(application, execution);
  process.stdout.write(`${JSON.stringify({ execution, verification }, null, 2)}\n`);
  process.exit(verification.verified ? 0 : 4);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.fixture) return runFixture(args);
  const mode = args.mode;
  const platform = args.platform;
  if (mode === 'live-inspect' && platform === 'freelancer') return inspectFreelancer(args);
  if (mode === 'live-inspect' && platform === 'ats') return inspectAts(args);
  if (mode === 'live-authorized' && platform === 'freelancer') return executeFreelancer(args);
  fail('NEEDS_INPUT', 'Supported modes: --platform freelancer|ats --mode live-inspect; live-authorized is currently Freelancer-only.');
}

await main();
