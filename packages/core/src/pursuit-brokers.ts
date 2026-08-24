import type { PursuitExecutionStatus } from './pursuit.ts';

export type CredentialKind = 'oauth' | 'api_token' | 'session' | 'service_account';

export interface CredentialLease {
  ref: string;
  platform: string;
  accountRef: string;
  kind: CredentialKind;
  leaseId: string;
  expiresAt?: string;
}

export interface CredentialResolveInput {
  credentialRef?: string;
  platform: string;
  accountRef: string;
  now?: string;
}

export interface CredentialResolveResult {
  ok: boolean;
  status: PursuitExecutionStatus;
  lease?: CredentialLease;
  reason?: string;
}

export interface CredentialBroker {
  resolve(input: CredentialResolveInput): Promise<CredentialResolveResult>;
}

export type SessionState =
  | 'ACTIVE'
  | 'AUTH_REQUIRED'
  | 'MFA_REQUIRED'
  | 'CAPTCHA_REQUIRED'
  | 'SESSION_EXPIRED';

export interface BrowserSessionLease {
  ref: string;
  platform: string;
  accountRef: string;
  state: SessionState;
  checkedAt: string;
}

export interface SessionInspectInput {
  sessionRef?: string;
  platform: string;
  accountRef: string;
}

export interface SessionInspectResult {
  ok: boolean;
  status: PursuitExecutionStatus;
  session?: BrowserSessionLease;
  reason?: string;
}

export interface SessionBroker {
  inspect(input: SessionInspectInput): Promise<SessionInspectResult>;
}

const SECRET_SHAPED_PREFIXES = [
  'bearer ',
  'basic ',
  'sk-',
  'ghp_',
  'github_pat_',
  'xoxb-',
  'xoxp-',
];

export function isOpaqueCredentialRef(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (SECRET_SHAPED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  return /^cred:\/\/[a-z0-9._/-]+$/i.test(value);
}

function parseTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class InMemoryCredentialBroker implements CredentialBroker {
  private readonly leases: Map<string, CredentialLease>;

  constructor(leases: readonly CredentialLease[] = []) {
    this.leases = new Map(leases.map((lease) => [lease.ref, { ...lease }]));
  }

  async resolve(input: CredentialResolveInput): Promise<CredentialResolveResult> {
    if (!isOpaqueCredentialRef(input.credentialRef)) {
      return { ok: false, status: 'AUTH_REQUIRED', reason: 'OPAQUE_CREDENTIAL_REFERENCE_REQUIRED' };
    }

    const lease = this.leases.get(input.credentialRef!);
    if (!lease) return { ok: false, status: 'AUTH_REQUIRED', reason: 'CREDENTIAL_NOT_FOUND' };
    if (lease.platform !== input.platform || lease.accountRef !== input.accountRef) {
      return { ok: false, status: 'ACCOUNT_MISMATCH', reason: 'CREDENTIAL_SCOPE_MISMATCH' };
    }

    if (lease.expiresAt) {
      const expiresAt = parseTime(lease.expiresAt);
      const now = parseTime(input.now ?? new Date().toISOString());
      if (expiresAt === undefined || now === undefined || now >= expiresAt) {
        return { ok: false, status: 'AUTH_REQUIRED', reason: 'CREDENTIAL_EXPIRED_OR_INVALID' };
      }
    }

    return { ok: true, status: 'EXECUTED_UNVERIFIED', lease: { ...lease } };
  }
}

function statusForSessionState(state: SessionState): PursuitExecutionStatus {
  switch (state) {
    case 'ACTIVE': return 'EXECUTED_UNVERIFIED';
    case 'MFA_REQUIRED': return 'MFA_REQUIRED';
    case 'CAPTCHA_REQUIRED': return 'CAPTCHA_REQUIRED';
    case 'SESSION_EXPIRED': return 'SESSION_EXPIRED';
    case 'AUTH_REQUIRED': return 'AUTH_REQUIRED';
  }
}

export class InMemorySessionBroker implements SessionBroker {
  private readonly sessions: Map<string, BrowserSessionLease>;

  constructor(sessions: readonly BrowserSessionLease[] = []) {
    this.sessions = new Map(sessions.map((session) => [session.ref, { ...session }]));
  }

  async inspect(input: SessionInspectInput): Promise<SessionInspectResult> {
    if (!input.sessionRef) return { ok: false, status: 'AUTH_REQUIRED', reason: 'SESSION_REFERENCE_REQUIRED' };
    const session = this.sessions.get(input.sessionRef);
    if (!session) return { ok: false, status: 'AUTH_REQUIRED', reason: 'SESSION_NOT_FOUND' };
    if (session.platform !== input.platform || session.accountRef !== input.accountRef) {
      return { ok: false, status: 'ACCOUNT_MISMATCH', reason: 'SESSION_SCOPE_MISMATCH' };
    }

    const status = statusForSessionState(session.state);
    if (session.state !== 'ACTIVE') return { ok: false, status, session: { ...session }, reason: session.state };
    return { ok: true, status, session: { ...session } };
  }
}
