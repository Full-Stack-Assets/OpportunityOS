import type { PursuitExecutionStatus } from '@opportunityos/core';

export interface AtsChallengeSnapshot {
  text: string;
  url: string;
  expectedAccount?: string;
  observedAccount?: string;
}

export function detectAtsChallenge(snapshot: AtsChallengeSnapshot): PursuitExecutionStatus | null {
  const text = `${snapshot.text} ${snapshot.url}`.toLowerCase();
  if (/captcha|verify you are human|cloudflare challenge|turnstile/.test(text)) return 'CAPTCHA_REQUIRED';
  if (/multi-factor|two-factor|2fa|mfa|verification code|code sent to your phone|security key|passkey/.test(text)) return 'MFA_REQUIRED';
  if (snapshot.expectedAccount && snapshot.observedAccount && snapshot.expectedAccount !== snapshot.observedAccount) return 'ACCOUNT_MISMATCH';
  if (/sign in|log in|session expired/.test(text)) return 'SESSION_EXPIRED';
  return null;
}
