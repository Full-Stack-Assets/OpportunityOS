import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PURSUIT_EXECUTION_STATUSES,
  compilePreparedApplication,
  hashCanonical,
} from '../src/index.ts';

const baseInput = {
  opportunityId: 'opp-1',
  pursuitId: 'p-1',
  targetPlatform: 'freelancer',
  targetUrl: 'https://www.freelancer.com/projects/123',
  applicantIdentityRef: 'applicant:nicholas',
  answers: [
    {
      fieldKey: 'degree',
      prompt: 'Degree?',
      answer: 'Current undergraduate',
      sourceOfTruthRef: 'canon:education',
      confidence: 'HIGH',
      evidenceClass: 'VERIFIED_FACT',
      attestationClass: 'ORDINARY',
    },
  ],
  portfolioRefs: ['github:Full-Stack-Assets/OpportunityOS'],
  expectedCost: { amountMinor: 0, currency: 'USD', credits: 0, requiresPurchase: false },
  requiredUploads: [],
  preparedAt: '2026-08-20T05:00:00Z',
  expiresAt: '2026-08-20T06:00:00Z',
};

test('compiler hashes the exact canonical application payload', () => {
  const app = compilePreparedApplication(baseInput);
  assert.match(app.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(app.payloadHash, hashCanonical(baseInput));
  assert.equal(compilePreparedApplication({ ...baseInput }).payloadHash, app.payloadHash);
});

test('compiler rejects floating-point and negative money', () => {
  assert.throws(
    () => compilePreparedApplication({
      ...baseInput,
      expectedCost: { ...baseInput.expectedCost, amountMinor: 12.5 },
    }),
    /amountMinor/,
  );
  assert.throws(
    () => compilePreparedApplication({
      ...baseInput,
      expectedCost: { ...baseInput.expectedCost, amountMinor: -1 },
    }),
    /amountMinor/,
  );
});

test('compiler rejects fractional credits', () => {
  assert.throws(
    () => compilePreparedApplication({
      ...baseInput,
      expectedCost: { ...baseInput.expectedCost, credits: 1.5 },
    }),
    /credits/,
  );
});

test('compiler rejects invalid or non-forward chronology', () => {
  assert.throws(() => compilePreparedApplication({ ...baseInput, expiresAt: 'not-a-date' }), /expiresAt/);
  assert.throws(() => compilePreparedApplication({ ...baseInput, expiresAt: baseInput.preparedAt }), /later than preparedAt/);
  assert.throws(() => compilePreparedApplication({ ...baseInput, preparedAt: 'not-a-date' }), /preparedAt/);
});

test('compiler rejects ungrounded availability and work authorization convenience values', () => {
  assert.throws(
    () => compilePreparedApplication({ ...baseInput, availability: '40 hours/week' }),
    /availability must exactly mirror/,
  );
  assert.throws(
    () => compilePreparedApplication({ ...baseInput, workAuthorizationStatus: 'Authorized' }),
    /workAuthorizationStatus must exactly mirror/,
  );
});

test('compiler accepts grounded convenience values from verified or user-attested answers', () => {
  const input = {
    ...baseInput,
    availability: '30 hours/week',
    workAuthorizationStatus: 'User-confirmed status',
    answers: [
      ...baseInput.answers,
      {
        fieldKey: 'availability',
        prompt: 'Availability?',
        answer: '30 hours/week',
        sourceOfTruthRef: 'canon:user-attestation:availability',
        confidence: 'HIGH',
        evidenceClass: 'USER_ATTESTED_FACT',
        attestationClass: 'AVAILABILITY',
      },
      {
        fieldKey: 'work_authorization',
        prompt: 'Work authorization?',
        answer: 'User-confirmed status',
        sourceOfTruthRef: 'canon:user-attestation:work-authorization',
        confidence: 'HIGH',
        evidenceClass: 'VERIFIED_FACT',
        attestationClass: 'LEGAL',
      },
    ],
  };
  const app = compilePreparedApplication(input);
  assert.equal(app.availability, '30 hours/week');
  assert.equal(app.workAuthorizationStatus, 'User-confirmed status');
});

test('runtime status registry contains every approved execution state', () => {
  assert.deepEqual(PURSUIT_EXECUTION_STATUSES, [
    'SUBMITTED_VERIFIED',
    'EXECUTED_UNVERIFIED',
    'ALREADY_SUBMITTED',
    'REJECTED_BY_PLATFORM',
    'NEEDS_INPUT',
    'NEEDS_HUMAN_AUTH',
    'AUTH_REQUIRED',
    'MFA_REQUIRED',
    'CAPTCHA_REQUIRED',
    'SESSION_EXPIRED',
    'ACCOUNT_MISMATCH',
    'PAYLOAD_CHANGED',
    'COST_CHANGED',
    'UNAVAILABLE_SENDER',
    'UNAVAILABLE',
    'FAILED',
  ]);
});
