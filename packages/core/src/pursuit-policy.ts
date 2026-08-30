import type { ExecutionMode, FormSchema, PreparedAnswer, PreparedApplication, PursuitExecutionStatus } from './pursuit.ts';

const HUMAN_ONLY = new Set([
  'LEGAL',
  'BACKGROUND_CHECK',
  'RELOCATION_TRAVEL',
  'PUBLICATION_VIDEO_WORK_SAMPLE',
]);

export interface LiveFormDiff {
  missingRequiredFieldKeys: string[];
  addedFieldKeys: string[];
  removedFieldKeys: string[];
}

export interface SubmissionPolicyResult {
  allowed: boolean;
  canExecuteWrite: boolean;
  status: PursuitExecutionStatus;
  reason?: string;
  diff: LiveFormDiff;
}

export function answerMayAutoFill(answer: PreparedAnswer): boolean {
  if (answer.evidenceClass === 'UNRESOLVED' || answer.evidenceClass === 'PROHIBITED_TO_INFER') return false;
  if (HUMAN_ONLY.has(answer.attestationClass)) return false;
  return answer.confidence !== 'LOW' && answer.answer !== undefined;
}

export function diffLiveForm(application: PreparedApplication, form: FormSchema): LiveFormDiff {
  const answerKeys = new Set(application.answers.map((answer) => answer.fieldKey));
  const formKeys = new Set(form.fields.map((field) => field.fieldKey));
  return {
    missingRequiredFieldKeys: form.fields.filter((field) => field.required && !answerKeys.has(field.fieldKey)).map((field) => field.fieldKey).sort(),
    addedFieldKeys: form.fields.filter((field) => !answerKeys.has(field.fieldKey)).map((field) => field.fieldKey).sort(),
    removedFieldKeys: application.answers.filter((answer) => !formKeys.has(answer.fieldKey)).map((answer) => answer.fieldKey).sort(),
  };
}

function costsChanged(application: PreparedApplication, form: FormSchema): boolean {
  const live = form.expectedCost;
  if (!live) return false;
  const prepared = application.expectedCost;
  if (live.requiresPurchase !== prepared.requiresPurchase) return true;
  if (live.amountMinor !== undefined && live.amountMinor !== prepared.amountMinor) return true;
  if (live.credits !== undefined && live.credits !== prepared.credits) return true;
  if (live.currency !== undefined && live.currency !== prepared.currency) return true;
  return false;
}

function blockedRequiredAnswer(application: PreparedApplication, form: FormSchema): PreparedAnswer | undefined {
  for (const field of form.fields) {
    if (!field.required) continue;
    const answer = application.answers.find((candidate) => candidate.fieldKey === field.fieldKey);
    if (answer && !answerMayAutoFill(answer)) return answer;
  }
  return undefined;
}

export function evaluateSubmissionPolicy(
  application: PreparedApplication,
  form: FormSchema,
  mode: ExecutionMode,
  now: string = new Date().toISOString(),
): SubmissionPolicyResult {
  const diff = diffLiveForm(application, form);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || nowMs >= Date.parse(application.expiresAt)) {
    return { allowed: false, canExecuteWrite: false, status: 'PAYLOAD_CHANGED', reason: 'PREPARED_APPLICATION_EXPIRED', diff };
  }
  if (application.targetPlatform !== form.targetPlatform || application.targetUrl !== form.targetUrl) {
    return { allowed: false, canExecuteWrite: false, status: 'PAYLOAD_CHANGED', reason: 'TARGET_MISMATCH', diff };
  }
  if (costsChanged(application, form)) {
    return { allowed: false, canExecuteWrite: false, status: 'COST_CHANGED', reason: 'LIVE_COST_DIFFERS_FROM_PREPARED_COST', diff };
  }
  const blocked = blockedRequiredAnswer(application, form);
  if (blocked) {
    return { allowed: false, canExecuteWrite: false, status: 'NEEDS_INPUT', reason: `REQUIRED_FIELD_UNRESOLVED:${blocked.fieldKey}`, diff };
  }
  if (diff.missingRequiredFieldKeys.length > 0) {
    return { allowed: false, canExecuteWrite: false, status: 'PAYLOAD_CHANGED', reason: `NEW_REQUIRED_FIELDS:${diff.missingRequiredFieldKeys.join(',')}`, diff };
  }
  if (mode === 'SIMULATION' || mode === 'LIVE_INSPECT') {
    return { allowed: true, canExecuteWrite: false, status: 'EXECUTED_UNVERIFIED', reason: `${mode}_IS_NON_WRITING`, diff };
  }
  return { allowed: true, canExecuteWrite: true, status: 'EXECUTED_UNVERIFIED', diff };
}
