import { CANONICAL_ARCHITECTURE_INVENTORY } from './canonical-architecture-inventory.ts';
import type {
  CanonicalRegistryRecord,
  RegistryDataClassification,
  RegistryHealth,
  RegistryVerification,
} from './agentic-registry.ts';

export type IntegrationCategoryId =
  | 'INT-001' | 'INT-002' | 'INT-003' | 'INT-004' | 'INT-005'
  | 'INT-006' | 'INT-007' | 'INT-008' | 'INT-009' | 'INT-010'
  | 'INT-011' | 'INT-012' | 'INT-013' | 'INT-014' | 'INT-015'
  | 'INT-016' | 'INT-017' | 'INT-018' | 'INT-019' | 'INT-020';

export type IntegrationPermissionTier = 'I0' | 'I1' | 'I2' | 'I3' | 'I4';
export type IntegrationBindingStatus = 'proposed' | 'sandbox' | 'approved' | 'suspended' | 'retired';
export type IntegrationEnvironment = 'sandbox' | 'test' | 'staging' | 'production' | 'unknown';
export type IntegrationOperation = 'read' | 'draft-write' | 'reversible-write' | 'human-confirmed-action';

export interface IntegrationCategory {
  id: IntegrationCategoryId;
  name: string;
  typicalUses: string;
  defaultAgentScope: string;
  sensitiveActionsRequiringHumanAuthorization: string;
}

export interface IntegrationPermissionProfile {
  tier: IntegrationPermissionTier;
  name: string;
  connectionAllowed: boolean;
  humanConfirmationRequired: boolean;
  permittedExamples: string;
  notPermitted: string;
}

export interface IntegrationScope {
  object: string;
  operations: IntegrationOperation[];
  fieldConstraints: string[];
}

export interface IntegrationTestCase {
  case: string;
  expectedResult: string;
  evidenceLocation: string;
}

export interface IntegrationBinding {
  id: string;
  registryId: string;
  categoryId: IntegrationCategoryId;
  provider: string;
  version: string;
  status: IntegrationBindingStatus;
  verification: RegistryVerification;
  health: RegistryHealth;
  dataClassifications: RegistryDataClassification[];
  owners: {
    system: string | null;
    technical: string | null;
    businessData: string | null;
  };
  approvedRoles: string[];
  disallowedRoles: string[];
  permissionTier: IntegrationPermissionTier;
  environment: IntegrationEnvironment;
  authentication: {
    method: string | null;
  };
  dataMinimization: string[];
  capabilities: string[];
  scopes: IntegrationScope[];
  prohibitedActions: string[];
  humanConfirmation: {
    requiredFor: string[];
    approvalRecordReference: string | null;
  };
  logging: {
    requiredAuditEvents: string[];
    contentRule: string;
    auditDestination: string | null;
    retention: string | null;
  };
  monitoring: {
    alerts: string[];
    reviewCadence: string | null;
    incidentContact: string | null;
  };
  failureBehavior: {
    failClosed: true;
    rules: Array<{ scenario: string; requiredBehavior: string }>;
  };
  testPlan: IntegrationTestCase[];
  source: {
    ref: string;
    observedAt: string;
  };
}

export interface IntegrationValidationResult {
  valid: boolean;
  errors: string[];
}

export interface IntegrationReadinessResult {
  ready: boolean;
  gaps: string[];
}

export const INTEGRATION_CATALOG: IntegrationCategory[] = [
  { id: 'INT-001', name: 'Knowledge repository', typicalUses: 'Retrieve approved policies, canon, procedures, product documents, and playbooks.', defaultAgentScope: 'Read approved collections; propose versioned drafts.', sensitiveActionsRequiringHumanAuthorization: 'Publishing or replacing source-of-truth content.' },
  { id: 'INT-002', name: 'Document management & e-signature', typicalUses: 'Store controlled documents, route review, manage redlines, and retain evidence.', defaultAgentScope: 'Read/write draft workspace; create review tasks.', sensitiveActionsRequiringHumanAuthorization: 'Signing, sending final documents, or changing retention/legal hold.' },
  { id: 'INT-003', name: 'Project/workflow management', typicalUses: 'Create bounded tasks, dependencies, statuses, and reminders.', defaultAgentScope: 'Create/update role-owned tasks; read dependencies.', sensitiveActionsRequiringHumanAuthorization: 'Changing portfolio scope, budgets, deadlines, or approvals without owner authorization.' },
  { id: 'INT-004', name: 'Calendar & scheduling', typicalUses: 'Retrieve availability, draft schedules, and send internal review requests.', defaultAgentScope: 'Read availability; create draft or hold events when approved.', sensitiveActionsRequiringHumanAuthorization: 'External invitations or consequential meeting changes.' },
  { id: 'INT-005', name: 'Asset management / object storage', typicalUses: 'Read/write versioned artifacts and metadata; compute checksums.', defaultAgentScope: 'Scoped project folders; append-only provenance.', sensitiveActionsRequiringHumanAuthorization: 'Deleting originals, changing master labels, or public sharing.' },
  { id: 'INT-006', name: 'DAM / media production suite', typicalUses: 'Retrieve/write creative candidates, reference packs, renders, and derivatives.', defaultAgentScope: 'Create labeled drafts in sandbox or project collections.', sensitiveActionsRequiringHumanAuthorization: 'Promoting to canon/final, external publishing, or rights-status changes.' },
  { id: 'INT-007', name: 'Code repository & CI', typicalUses: 'Read repositories, open draft changes, and execute tests in isolated environments.', defaultAgentScope: 'Branch-level write; CI sandbox; pull-request creation.', sensitiveActionsRequiringHumanAuthorization: 'Merge to protected branch, production secret access, or production deployment.' },
  { id: 'INT-008', name: 'Cloud/infrastructure & observability', typicalUses: 'Read approved logs, metrics, and configs; create nonproduction diagnostic changes.', defaultAgentScope: 'Read-only by default; sandbox/test scopes.', sensitiveActionsRequiringHumanAuthorization: 'Production changes, access-policy changes, destructive actions, or public status updates.' },
  { id: 'INT-009', name: 'Data warehouse / BI', typicalUses: 'Query approved views, publish draft analyses, and refresh non-sensitive sandbox assets.', defaultAgentScope: 'Read-only curated views; workspace-level draft write.', sensitiveActionsRequiringHumanAuthorization: 'Data deletion, source-table writes, broad sharing, or sensitive export.' },
  { id: 'INT-010', name: 'CRM / customer platform', typicalUses: 'Retrieve account context, create internal notes, and draft communications/tasks.', defaultAgentScope: 'Read selected accounts; internal-note/task write.', sensitiveActionsRequiringHumanAuthorization: 'External sends, customer-record/terms changes, or sensitive exports.' },
  { id: 'INT-011', name: 'Support/case-management system', typicalUses: 'Read assigned cases, draft replies, classify/tag, and create escalation tasks.', defaultAgentScope: 'Agent-specific queue access; draft-only external responses.', sensitiveActionsRequiringHumanAuthorization: 'Account action, refund, benefit/eligibility decision, or sensitive external communication.' },
  { id: 'INT-012', name: 'Marketing automation & CMS', typicalUses: 'Draft content, build non-live campaigns, validate assets, and retrieve reporting.', defaultAgentScope: 'Staging/draft workspace and read analytics.', sensitiveActionsRequiringHumanAuthorization: 'Publishing, emailing, posting, audience changes, or spend increases.' },
  { id: 'INT-013', name: 'Social/community platform', typicalUses: 'Retrieve approved metrics/inbox messages, create drafts, and route cases.', defaultAgentScope: 'Read-only and draft queue.', sensitiveActionsRequiringHumanAuthorization: 'Posts, DMs, sensitive replies, or moderation sanctions.' },
  { id: 'INT-014', name: 'ERP/accounting/billing', typicalUses: 'Retrieve approved reports, prepare reconciliations, and create internal review items.', defaultAgentScope: 'Read-only; draft journal/support workspaces where available.', sensitiveActionsRequiringHumanAuthorization: 'Payments, journal posting, tax filing, refunds, credits, or master-data changes.' },
  { id: 'INT-015', name: 'Contract/CLM/rights system', typicalUses: 'Retrieve agreements, create metadata, and track dates, obligations, and rights evidence.', defaultAgentScope: 'Read terms and write draft metadata/alerts.', sensitiveActionsRequiringHumanAuthorization: 'Signing, negotiation, granting licenses, legal interpretation, or submission.' },
  { id: 'INT-016', name: 'Identity, IAM, and HRIS', typicalUses: 'Retrieve limited directory, role, and authority information for approved workflows.', defaultAgentScope: 'Read minimum needed attributes, de-identified where possible.', sensitiveActionsRequiringHumanAuthorization: 'Account lifecycle, permission changes, employment actions, or compensation changes.' },
  { id: 'INT-017', name: 'EHR, LIMS, public case-management', typicalUses: 'Retrieve minimum authorized record fields for administrative support and draft documentation.', defaultAgentScope: 'Strict read-only/draft-only, patient/case scoped.', sensitiveActionsRequiringHumanAuthorization: 'Clinical orders, diagnoses, eligibility/outcome decisions, disclosure, or final signatures.' },
  { id: 'INT-018', name: 'Maps, GIS, field service, EAM/CMMS', typicalUses: 'View locations/assets/work orders and create draft plans/checklists.', defaultAgentScope: 'Read assigned locations; draft work orders.', sensitiveActionsRequiringHumanAuthorization: 'Dispatch, work authorization, safety closure, or engineering sign-off.' },
  { id: 'INT-019', name: 'External research/search services', typicalUses: 'Retrieve publicly available or licensed information with source metadata.', defaultAgentScope: 'Search/read; download only to governed workspace.', sensitiveActionsRequiringHumanAuthorization: 'Credential sharing, scraping outside terms, or external account actions.' },
  { id: 'INT-020', name: 'Communication platforms', typicalUses: 'Draft messages, create internal threads, route reviews, and summarize approved meetings.', defaultAgentScope: 'Internal draft/notification scope.', sensitiveActionsRequiringHumanAuthorization: 'External sends, invitations, high-impact announcements, or sensitive disclosure.' },
];

export const INTEGRATION_PERMISSION_TIERS: Record<IntegrationPermissionTier, IntegrationPermissionProfile> = {
  I0: { tier: 'I0', name: 'No connection', connectionAllowed: false, humanConfirmationRequired: false, permittedExamples: 'Analyze supplied inputs; create draft output.', notPermitted: 'System access of any kind.' },
  I1: { tier: 'I1', name: 'Read-only scoped', connectionAllowed: true, humanConfirmationRequired: false, permittedExamples: 'Read named fields, folders, views, or queues.', notPermitted: 'Writes, broad exports, or external sharing.' },
  I2: { tier: 'I2', name: 'Draft/workspace write', connectionAllowed: true, humanConfirmationRequired: false, permittedExamples: 'Create drafts, internal notes, tags, tasks, or sandbox artifacts.', notPermitted: 'Publish, submit, transact, or merge protected changes.' },
  I3: { tier: 'I3', name: 'Reversible operational write', connectionAllowed: true, humanConfirmationRequired: false, permittedExamples: 'Perform explicitly authorized reversible changes in a bounded environment.', notPermitted: 'Irreversible, production, financial, access, legal, or public actions.' },
  I4: { tier: 'I4', name: 'Human-confirmed action', connectionAllowed: true, humanConfirmationRequired: true, permittedExamples: 'Prepare an action for a named human to review and execute or confirm.', notPermitted: 'Silent execution without accountable confirmation.' },
};

const AUDIT_EVENTS = ['authentication', 'query-or-action-type', 'object-scope', 'result-status', 'approval-id', 'error', 'correlation-or-work-item-id'];
const CONTENT_LOGGING_RULE = 'Avoid raw sensitive content unless policy requires it; prefer references and hashes.';
const FAILURE_RULES = [
  { scenario: 'authentication-or-connectivity-failure', requiredBehavior: 'Stop, log, preserve work, report failure; never retry indefinitely or bypass authentication.' },
  { scenario: 'permission-denied', requiredBehavior: 'Treat denial as a control, stop the denied path, log it, and require scoped review before retry.' },
  { scenario: 'sensitive-or-restricted-data-detected', requiredBehavior: 'Minimize exposure and route according to role-specific handling policy.' },
  { scenario: 'i4-authorization-required', requiredBehavior: 'Create a review packet and wait for named human confirmation.' },
  { scenario: 'unexpected-schema-or-result', requiredBehavior: 'Stop downstream action, preserve evidence, and require validation.' },
  { scenario: 'rate-or-cost-threshold-reached', requiredBehavior: 'Pause noncritical work and surface the condition to the responsible owner.' },
];

const DEFAULT_BINDING_MAP: Record<string, { categoryId: IntegrationCategoryId; permissionTier: IntegrationPermissionTier }> = {
  'integration.github': { categoryId: 'INT-007', permissionTier: 'I2' },
  'integration.chatgpt-library': { categoryId: 'INT-001', permissionTier: 'I1' },
  'integration.chatgpt-automations': { categoryId: 'INT-003', permissionTier: 'I2' },
  'integration.gmail': { categoryId: 'INT-020', permissionTier: 'I2' },
  'integration.google-drive': { categoryId: 'INT-001', permissionTier: 'I1' },
  'integration.clickup': { categoryId: 'INT-003', permissionTier: 'I2' },
  'integration.wisebase': { categoryId: 'INT-001', permissionTier: 'I1' },
  'integration.airtable': { categoryId: 'INT-009', permissionTier: 'I2' },
  'integration.ideabrowser': { categoryId: 'INT-019', permissionTier: 'I1' },
  'integration.openai-platform': { categoryId: 'INT-016', permissionTier: 'I4' },
  'integration.canonical-memory-verifier': { categoryId: 'INT-001', permissionTier: 'I1' },
  'integration.contra': { categoryId: 'INT-019', permissionTier: 'I2' },
  'integration.freelancer': { categoryId: 'INT-019', permissionTier: 'I2' },
  'integration.reddit': { categoryId: 'INT-019', permissionTier: 'I1' },
  'integration.hacker-news': { categoryId: 'INT-019', permissionTier: 'I1' },
  'integration.elevenlabs': { categoryId: 'INT-006', permissionTier: 'I2' },
  'integration.youtube': { categoryId: 'INT-012', permissionTier: 'I2' },
};

const SECRET_PATTERNS = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:access|refresh)[_-]?token\s*[:=]\s*\S+/i,
];

function containsSecretMaterial(value: unknown): boolean {
  const serialized = JSON.stringify(value);
  return SECRET_PATTERNS.some((pattern) => pattern.test(serialized));
}

function sourceFor(record: CanonicalRegistryRecord): { ref: string; observedAt: string } {
  const evidence = record.evidence[0];
  return {
    ref: record.canonicalRef ?? evidence?.sourceRef ?? '',
    observedAt: evidence?.observedAt ?? '',
  };
}

export function integrationRecordToBinding(record: CanonicalRegistryRecord): IntegrationBinding {
  if (record.kind !== 'integration') throw new Error(`INTEGRATION_RECORD_REQUIRED: ${record.id}`);
  const mapping = DEFAULT_BINDING_MAP[record.id] ?? { categoryId: 'INT-019' as const, permissionTier: 'I1' as const };
  return {
    id: `binding://${record.id.replace(/^integration\./, '')}`,
    registryId: record.id,
    categoryId: mapping.categoryId,
    provider: record.name,
    version: '0.1.0',
    status: 'proposed',
    verification: record.verification,
    health: record.health,
    dataClassifications: [record.dataClassification],
    owners: { system: null, technical: null, businessData: null },
    approvedRoles: [],
    disallowedRoles: [],
    permissionTier: mapping.permissionTier,
    environment: 'unknown',
    authentication: { method: null },
    dataMinimization: [],
    capabilities: [...(record.capabilities ?? [])],
    scopes: [],
    prohibitedActions: [],
    humanConfirmation: { requiredFor: [], approvalRecordReference: null },
    logging: {
      requiredAuditEvents: [...AUDIT_EVENTS],
      contentRule: CONTENT_LOGGING_RULE,
      auditDestination: null,
      retention: null,
    },
    monitoring: { alerts: [], reviewCadence: null, incidentContact: null },
    failureBehavior: { failClosed: true, rules: FAILURE_RULES.map((rule) => ({ ...rule })) },
    testPlan: [],
    source: sourceFor(record),
  };
}

function operationAllowedAtTier(operation: IntegrationOperation, tier: IntegrationPermissionTier): boolean {
  if (tier === 'I0') return false;
  if (tier === 'I1') return operation === 'read';
  if (tier === 'I2') return operation === 'read' || operation === 'draft-write';
  if (tier === 'I3') return operation !== 'human-confirmed-action';
  return true;
}

export function validateIntegrationBinding(binding: IntegrationBinding): IntegrationValidationResult {
  const errors: string[] = [];
  if (!/^binding:\/\/[a-z0-9][a-z0-9._/-]*$/.test(binding.id)) errors.push('id must use a stable binding:// URI');
  if (!binding.registryId.startsWith('integration.')) errors.push('registryId must reference integration.*');
  if (!INTEGRATION_CATALOG.some((item) => item.id === binding.categoryId)) errors.push(`unknown integration category: ${binding.categoryId}`);
  if (!INTEGRATION_PERMISSION_TIERS[binding.permissionTier]) errors.push(`unknown permission tier: ${binding.permissionTier}`);
  if (!binding.provider.trim()) errors.push('provider is required');
  if (!/^\d+\.\d+\.\d+/.test(binding.version)) errors.push('version must be semantic version');
  if (!binding.source.ref.trim() || !binding.source.observedAt.trim()) errors.push('source provenance is required');
  if (binding.failureBehavior.failClosed !== true) errors.push('failure behavior must fail closed');
  if (containsSecretMaterial(binding.authentication) || containsSecretMaterial(binding.scopes)) errors.push('secret-like material is prohibited from integration bindings');

  if (binding.permissionTier === 'I0' && binding.scopes.length > 0) errors.push('I0 cannot contain system scopes');
  for (const scope of binding.scopes) {
    if (!scope.object.trim()) errors.push('scope object is required');
    if (scope.operations.length === 0) errors.push(`scope ${scope.object || '<unknown>'} must declare at least one operation`);
    for (const operation of scope.operations) {
      if (!operationAllowedAtTier(operation, binding.permissionTier)) {
        errors.push(`${binding.permissionTier} does not permit ${operation}`);
      }
    }
  }

  const hasHumanConfirmedScope = binding.scopes.some((scope) => scope.operations.includes('human-confirmed-action'));
  if (binding.permissionTier === 'I4' && hasHumanConfirmedScope) {
    if (binding.humanConfirmation.requiredFor.length === 0) errors.push('I4 requires named human-confirmation triggers');
    if (!binding.humanConfirmation.approvalRecordReference?.trim()) errors.push('I4 requires an approval record reference');
  }

  return { valid: errors.length === 0, errors };
}

export function assessIntegrationReadiness(binding: IntegrationBinding): IntegrationReadinessResult {
  const gaps = [...validateIntegrationBinding(binding).errors];
  if (binding.status !== 'approved') gaps.push('status must be approved');
  if (!binding.owners.system?.trim()) gaps.push('owners.system');
  if (!binding.owners.technical?.trim()) gaps.push('owners.technical');
  if (!binding.owners.businessData?.trim()) gaps.push('owners.businessData');
  if (!binding.authentication.method?.trim()) gaps.push('authentication.method');
  if (binding.approvedRoles.length === 0) gaps.push('approvedRoles');
  if (binding.dataMinimization.length === 0) gaps.push('dataMinimization');
  if (binding.permissionTier !== 'I0' && binding.scopes.length === 0) gaps.push('scopes');
  if (!binding.logging.auditDestination?.trim()) gaps.push('logging.auditDestination');
  if (!binding.logging.retention?.trim()) gaps.push('logging.retention');
  if (binding.monitoring.alerts.length === 0) gaps.push('monitoring.alerts');
  if (binding.testPlan.length < 2) gaps.push('testPlan');
  if (binding.health === 'UNAVAILABLE' || binding.health === 'UNKNOWN') gaps.push('verified integration health');
  if (binding.permissionTier === 'I4' && binding.scopes.some((scope) => scope.operations.includes('human-confirmed-action'))) {
    if (binding.humanConfirmation.requiredFor.length === 0) gaps.push('humanConfirmation.requiredFor');
    if (!binding.humanConfirmation.approvalRecordReference?.trim()) gaps.push('humanConfirmation.approvalRecordReference');
  }
  return { ready: gaps.length === 0, gaps };
}

export const INTEGRATION_REGISTRY: IntegrationBinding[] = CANONICAL_ARCHITECTURE_INVENTORY
  .filter((record) => record.kind === 'integration')
  .map(integrationRecordToBinding);
