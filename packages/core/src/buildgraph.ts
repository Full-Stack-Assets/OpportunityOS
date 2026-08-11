export type BuildGraphDecision =
  | 'REUSE_EXISTING'
  | 'EXTEND_EXISTING'
  | 'MERGE_WITH_EXISTING'
  | 'FORK_EXISTING'
  | 'REFACTOR_EXISTING'
  | 'ARCHIVE_DUPLICATE'
  | 'CREATE_NEW';

export interface BuildGraphPreflightResult {
  requestId: string;
  decision: BuildGraphDecision;
  justification: string;
  primaryProjectId?: string;
  candidates: unknown[];
  reusePlan: { reuse: string[]; extend: string[]; create: string[] };
  wasteRisk: { score: number; estimatedRecreationPercent: number; factors: string[] };
  evidence: { projectIds: string[]; constraintIds: string[]; decisionIds: string[] };
  generatedAt: string;
  payloadHash: string;
}

export type BuildStartDecision =
  | { allowed: true; reason: 'BUILDGRAPH_CREATE_NEW_AUTHORIZED' }
  | { allowed: false; reason: 'BUILDGRAPH_PREFLIGHT_REQUIRED' | 'BUILDGRAPH_REUSE_REQUIRED' };

export function decideBuildStart(preflight: BuildGraphPreflightResult | undefined): BuildStartDecision {
  if (!preflight) return { allowed: false, reason: 'BUILDGRAPH_PREFLIGHT_REQUIRED' };
  if (preflight.decision !== 'CREATE_NEW') return { allowed: false, reason: 'BUILDGRAPH_REUSE_REQUIRED' };
  return { allowed: true, reason: 'BUILDGRAPH_CREATE_NEW_AUTHORIZED' };
}

export interface BuildGraphRequest {
  id: string;
  name: string;
  description: string;
  purpose: string;
  projectType: string;
  capabilities: string[];
  technologies: string[];
  targetUsers: string[];
  features: string[];
}

export interface BuildGraphClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export async function runBuildGraphPreflight(
  request: BuildGraphRequest,
  options: BuildGraphClientOptions,
): Promise<BuildGraphPreflightResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${options.baseUrl.replace(/\/$/, '')}/v1/preflight`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`BuildGraph preflight failed with HTTP ${response.status}`);
  const parsed = await response.json() as BuildGraphPreflightResult;
  if (!parsed.requestId || !parsed.decision || !parsed.payloadHash) throw new Error('BuildGraph returned an invalid preflight payload');
  return parsed;
}
