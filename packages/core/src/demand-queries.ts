export type DemandQueryFamilyId =
  | 'EXPLICIT_DEVELOPER_HIRE'
  | 'SOFTWARE_NEEDS_BUILDING'
  | 'AI_AUTOMATION_REQUEST'
  | 'INTEGRATION_PROBLEM'
  | 'MANUAL_PROCESS_PAIN'
  | 'REVENUE_LEAK'
  | 'DATA_REPORTING_PAIN'
  | 'RELIABILITY_FAILURE'
  | 'PAID_BOUNTY'
  | 'PROCUREMENT_OR_RFP'
  | 'MIGRATION_REQUEST'
  | 'MVP_PRODUCT_BUILD';

export type DemandQueryProvider = 'github_issues' | 'hacker_news';

export interface DemandQueryFamily {
  id: DemandQueryFamilyId;
  version: '1.0.0';
  category: string;
  compatibleProviders: DemandQueryProvider[];
  providerQueries: Partial<Record<DemandQueryProvider, string[]>>;
  positivePatterns: RegExp[];
  exclusionPatterns: RegExp[];
  buyerIntentWeight: number;
  economicPainWeight: number;
  status: 'ACTIVE' | 'INACTIVE';
}

const SHARED_EXCLUSIONS = [
  /\btutorial\b/i,
  /\bhow to get hired\b/i,
  /\bcareer advice\b/i,
  /\bresume review\b/i,
  /\bportfolio review\b/i,
  /\blearning project\b/i,
  /\bexample project\b/i,
];

function family(
  id: DemandQueryFamilyId,
  category: string,
  githubQueries: string[],
  positivePatterns: RegExp[],
  buyerIntentWeight: number,
  economicPainWeight: number,
  exclusionPatterns: RegExp[] = SHARED_EXCLUSIONS,
): DemandQueryFamily {
  return {
    id,
    version: '1.0.0',
    category,
    compatibleProviders: ['github_issues', 'hacker_news'],
    providerQueries: {
      github_issues: githubQueries,
      hacker_news: [],
    },
    positivePatterns,
    exclusionPatterns,
    buyerIntentWeight,
    economicPainWeight,
    status: 'ACTIVE',
  };
}

export const DEMAND_QUERY_LIBRARY_V1: readonly DemandQueryFamily[] = Object.freeze([
  family(
    'EXPLICIT_DEVELOPER_HIRE',
    'explicit_hiring',
    ['"looking for a developer"', '"need a developer"', '"hire a developer"', '"looking for an engineer"', '"need a contractor"'],
    [
      /looking for (?:a |an )?(?:developer|engineer|contractor|freelancer)/i,
      /need (?:a |an )?(?:developer|engineer|contractor|freelancer)/i,
      /(?:hire|hiring) (?:a |an )?(?:developer|engineer|contractor|freelancer)/i,
      /seeking (?:a |an )?(?:developer|engineer|contractor|freelancer)/i,
    ],
    1,
    0.35,
  ),
  family(
    'SOFTWARE_NEEDS_BUILDING',
    'software_build',
    ['"need someone to build"', '"looking for someone to build"', '"need help building"', '"need software"'],
    [
      /need .{0,80}(?:build|develop|create|implement).{0,80}(?:software|app|tool|system|dashboard|api)/i,
      /looking for .{0,80}(?:build|develop|create|implement).{0,80}(?:software|app|tool|system|dashboard|api)/i,
      /can someone .{0,40}(?:build|develop|create|implement)/i,
    ],
    0.9,
    0.45,
  ),
  family(
    'AI_AUTOMATION_REQUEST',
    'ai_automation',
    ['"need help" automation', '"looking for" automation', '"need" "LLM integration"', '"need" "AI agent"', '"need" MCP'],
    [
      /(?:need|looking for|help).{0,100}(?:ai|llm|automation|automate|agent|mcp|workflow)/i,
      /(?:ai|llm|automation|automate|agent|mcp).{0,100}(?:need|help|build|integrat)/i,
    ],
    0.9,
    0.7,
  ),
  family(
    'INTEGRATION_PROBLEM',
    'integration',
    ['"need integration"', '"need help integrating"', '"API integration"', '"sync" "systems"'],
    [
      /need .{0,80}(?:integration|integrating|api|sync)/i,
      /(?:integration|api|sync).{0,80}(?:problem|help|need|broken|between systems)/i,
      /copy(?:ing)? .{0,80} between systems/i,
    ],
    0.75,
    0.75,
  ),
  family(
    'MANUAL_PROCESS_PAIN',
    'operational_labor',
    ['"manual process"', '"hours every week"', '"copying" "between systems"', '"manual workflow"'],
    [
      /manual (?:process|workflow|entry|work)/i,
      /\d+\s+hours?.{0,40}(?:week|day|month)/i,
      /copy(?:ing)? .{0,80} between systems/i,
      /repetitive .{0,60}(?:task|work|process)/i,
    ],
    0.55,
    0.95,
  ),
  family(
    'REVENUE_LEAK',
    'revenue_loss',
    ['"missing invoices"', '"lost revenue"', '"payment delay"', '"revenue leak"', '"unpaid invoices"'],
    [
      /miss(?:ed|ing) invoices?/i,
      /lost revenue/i,
      /revenue leak/i,
      /unpaid invoices?/i,
      /payment delays?/i,
      /los(?:e|ing) .{0,40}\$?\d+/i,
    ],
    0.55,
    1,
  ),
  family(
    'DATA_REPORTING_PAIN',
    'data_reporting',
    ['"need dashboard"', '"manual reporting"', '"need data pipeline"', '"reporting automation"'],
    [
      /need .{0,60}(?:dashboard|data pipeline|reporting system|analytics)/i,
      /manual report(?:ing|s)?/i,
      /reporting .{0,60}(?:slow|pain|problem|automation|manual)/i,
    ],
    0.65,
    0.7,
  ),
  family(
    'RELIABILITY_FAILURE',
    'reliability',
    ['"downtime" help', '"reliability" help', '"production issue" contractor', '"recurring outage"'],
    [
      /(?:downtime|outage|production failure|recurring failure|unreliable).{0,80}(?:help|need|contractor|developer|fix)/i,
      /(?:help|need|contractor|developer).{0,80}(?:downtime|outage|reliability|production failure)/i,
    ],
    0.6,
    0.85,
  ),
  family(
    'PAID_BOUNTY',
    'paid_bounty',
    ['"bounty"', '"paid" "help wanted"', '"paid issue"', '"paid fix"'],
    [
      /\bbounty\b/i,
      /\bpaid (?:issue|fix|task|work|help)\b/i,
      /\bhelp wanted\b.{0,80}\bpaid\b/i,
    ],
    0.9,
    0.55,
  ),
  family(
    'PROCUREMENT_OR_RFP',
    'procurement',
    ['"RFP"', '"request for proposal"', '"contract opportunity"', '"seeking proposals"'],
    [
      /\brfp\b/i,
      /request for proposals?/i,
      /seeking proposals?/i,
      /contract opportunity/i,
      /procurement .{0,80}(?:software|technology|developer|consult)/i,
    ],
    1,
    0.8,
  ),
  family(
    'MIGRATION_REQUEST',
    'migration',
    ['"need help migrating"', '"migration" contractor', '"migrate" "need help"', '"migration project"'],
    [
      /need help migrat/i,
      /migration .{0,80}(?:contractor|developer|consultant|project|help)/i,
      /(?:contractor|developer|consultant).{0,80}migrat/i,
    ],
    0.75,
    0.65,
  ),
  family(
    'MVP_PRODUCT_BUILD',
    'mvp_build',
    ['"MVP" developer', '"build MVP"', '"need an MVP"', '"MVP" contractor'],
    [
      /(?:need|build|develop).{0,60}\bmvp\b/i,
      /\bmvp\b.{0,60}(?:developer|contractor|engineer|build|help)/i,
    ],
    0.85,
    0.45,
  ),
]);

export function getDemandQueryFamily(id: string, version?: string): DemandQueryFamily {
  const matchingId = DEMAND_QUERY_LIBRARY_V1.find((candidate) => candidate.id === id);
  if (!matchingId) throw new TypeError(`UNKNOWN_DEMAND_QUERY_FAMILY:${id}`);
  if (version !== undefined && version !== matchingId.version) {
    throw new TypeError(`UNKNOWN_DEMAND_QUERY_VERSION:${id}@${version}`);
  }
  return matchingId;
}

export function matchesDemandQueryFamily(text: string, queryFamily: DemandQueryFamily): boolean {
  if (typeof text !== 'string' || text.trim() === '') return false;
  if (queryFamily.exclusionPatterns.some((pattern) => pattern.test(text))) return false;
  return queryFamily.positivePatterns.some((pattern) => pattern.test(text));
}
