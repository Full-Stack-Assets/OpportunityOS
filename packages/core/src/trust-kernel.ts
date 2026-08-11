import { hashCanonical } from './canonical.ts';

export interface ActionIntent {
  id: string;
  actionType: string;
  payload: unknown;
}

export interface Approval {
  approvalId: string;
  actionId: string;
  actionType: string;
  payloadHash: string;
  subject: string;
  expiresAt: string;
  signature: string;
}

export interface ApprovalInput {
  approvalId: string;
  subject: string;
  expiresAt: string;
  signature: string;
}

export type SignatureVerifier = (approval: Approval) => Promise<boolean>;

export type AuthorizationResult =
  | { authorized: true; approvalId: string; payloadHash: string }
  | { authorized: false; reason: 'ACTION_ID_MISMATCH' | 'ACTION_TYPE_MISMATCH' | 'PAYLOAD_HASH_MISMATCH' | 'APPROVAL_EXPIRED' | 'SIGNATURE_INVALID' };

export function createApproval(intent: ActionIntent, input: ApprovalInput): Approval {
  return {
    approvalId: input.approvalId,
    actionId: intent.id,
    actionType: intent.actionType,
    payloadHash: hashCanonical(intent.payload),
    subject: input.subject,
    expiresAt: input.expiresAt,
    signature: input.signature,
  };
}

export async function authorizeAction(
  intent: ActionIntent,
  approval: Approval,
  now: string,
  verifySignature: SignatureVerifier,
): Promise<AuthorizationResult> {
  if (approval.actionId !== intent.id) return { authorized: false, reason: 'ACTION_ID_MISMATCH' };
  if (approval.actionType !== intent.actionType) return { authorized: false, reason: 'ACTION_TYPE_MISMATCH' };
  const payloadHash = hashCanonical(intent.payload);
  if (approval.payloadHash !== payloadHash) return { authorized: false, reason: 'PAYLOAD_HASH_MISMATCH' };
  if (Date.parse(now) >= Date.parse(approval.expiresAt)) return { authorized: false, reason: 'APPROVAL_EXPIRED' };
  if (!(await verifySignature(approval))) return { authorized: false, reason: 'SIGNATURE_INVALID' };
  return { authorized: true, approvalId: approval.approvalId, payloadHash };
}

export interface ReceiptInput {
  actionId: string;
  outcome: string;
  occurredAt: string;
  evidence?: unknown;
}

export interface Receipt extends ReceiptInput {
  previousReceiptHash?: string;
  receiptHash: string;
}

export function chainReceipt(previous: Receipt | undefined, input: ReceiptInput): Receipt {
  const body = {
    ...input,
    ...(previous ? { previousReceiptHash: previous.receiptHash } : {}),
  };
  return { ...body, receiptHash: hashCanonical(body) };
}
