import type { CanonicalRegistryRecord } from './agentic-registry.ts';

const observedAt = '2026-08-17';
const githubEvidence = (sourceRef: string, verified = false) => [{ sourceType: 'github' as const, sourceRef, observedAt, verified }];
const libraryEvidence = (sourceRef: string, verified = true) => [{ sourceType: 'library' as const, sourceRef, observedAt, verified }];
const contextEvidence = (sourceRef: string) => [{ sourceType: 'user-context' as const, sourceRef, observedAt, verified: false }];
const systemEvidence = (sourceRef: string, verified = true) => [{ sourceType: 'system' as const, sourceRef, observedAt, verified }];
const portfolioEvidence = (sourceRef = 'wisebase:01_ACTIVE_PORTFOLIO_SEED.pdf') => libraryEvidence(sourceRef, true);

export const CANONICAL_ARCHITECTURE_INVENTORY: CanonicalRegistryRecord[] = [
  {
    id: 'project.buildgraph-os', kind: 'project', name: 'BuildGraph OS', lifecycle: 'active', verification: 'VERIFIED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Persistent organizational memory, capability graph, asset intelligence, reuse, similarity analysis, and duplicate-work prevention.',
    canonicalRef: 'library:01_BUILDGRAPH_OS_CANONICAL.md',
    relationships: [{ type: 'implements', targetId: 'repository.opportunityos' }, { type: 'uses', targetId: 'catalog.agentic-role-library' }],
    evidence: libraryEvidence('01_BUILDGRAPH_OS_CANONICAL.md'),
  },
  {
    id: 'project.agentic-skill-os', kind: 'project', name: 'Agentic Skill OS', lifecycle: 'active', verification: 'VERIFIED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Execution and composition layer for skills, agents, providers, tools, capability resolution, governed workflows, verification, and telemetry.',
    canonicalRef: 'library:2026-08-12-buildgraph-agentic-skill-os-design.md',
    relationships: [{ type: 'depends_on', targetId: 'project.buildgraph-os' }, { type: 'implements', targetId: 'repository.opportunityos' }, { type: 'uses', targetId: 'catalog.agentic-role-library' }, { type: 'uses', targetId: 'catalog.agentic-skill-library' }, { type: 'uses', targetId: 'catalog.agentic-integration-library' }],
    evidence: libraryEvidence('2026-08-12-buildgraph-agentic-skill-os-design.md'),
  },
  {
    id: 'project.opportunityos', kind: 'project', name: 'OpportunityOS', lifecycle: 'active', verification: 'VERIFIED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Opportunity intelligence, pursuit, governed fulfillment, delivery, payment, and outcome-learning vertical.',
    canonicalRef: 'github:Full-Stack-Assets/OpportunityOS',
    relationships: [{ type: 'implements', targetId: 'repository.opportunityos' }, { type: 'depends_on', targetId: 'project.buildgraph-os' }],
    evidence: githubEvidence('Full-Stack-Assets/OpportunityOS@6903279c40c61b5088acf7c5ad3341cb0075ed37', true),
  },
  {
    id: 'project.agentic-control-fabric', kind: 'project', name: 'Agentic Control Fabric', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Provider-neutral objective intake, context resolution, capability routing, authority, execution, verification, persistence, and learning fabric.',
    relationships: [{ type: 'depends_on', targetId: 'project.buildgraph-os' }, { type: 'depends_on', targetId: 'project.agentic-skill-os' }, { type: 'implements', targetId: 'repository.opportunityos' }],
    evidence: contextEvidence('directive:single-objective-agentic-ecosystem'),
  },
  {
    id: 'project.integration-fabric', kind: 'project', name: 'Integration Fabric', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Persistent registry and shared ingestion layer for connectors, OAuth connections, MCP servers, APIs, plugins, and cross-platform access.',
    relationships: [{ type: 'depends_on', targetId: 'project.buildgraph-os' }], evidence: contextEvidence('architecture:integration-fabric'),
  },
  {
    id: 'project.songforge-os', kind: 'project', name: 'Songforge OS', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Agentic music creation, media generation, persistent voice, release, distribution, and analytics system.',
    relationships: [{ type: 'uses', targetId: 'catalog.agentic-role-library' }], evidence: contextEvidence('project:songforge-os'),
  },
  {
    id: 'project.blaize-sunday', kind: 'project', name: 'BLAIZE SUNDAY', lifecycle: 'active', verification: 'VERIFIED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Unified virtual artist intelligence and operating system using role-library based agent divisions.',
    canonicalRef: 'library:BLAIZE_SUNDAY_UNIFIED_MASTER_SYSTEM_V3.md',
    relationships: [{ type: 'uses', targetId: 'catalog.agentic-role-library' }, { type: 'uses', targetId: 'catalog.agentic-skill-library' }, { type: 'uses', targetId: 'catalog.agentic-integration-library' }],
    evidence: libraryEvidence('BLAIZE_SUNDAY_UNIFIED_MASTER_SYSTEM_V3.md'),
  },
  { id: 'project.tradewind', kind: 'project', name: 'Tradewind Dealflow', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Governed real-estate dealflow and simulation system.', evidence: contextEvidence('project:tradewind-dealflow') },
  { id: 'project.temporal-drift', kind: 'project', name: 'Temporal Drift', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Game/worldline project.', evidence: contextEvidence('project:temporal-drift') },
  { id: 'project.hostgraph', kind: 'project', name: 'HostGraph Procurement Command Center', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Restaurant procurement and margin intelligence system.', evidence: contextEvidence('project:hostgraph') },
  { id: 'project.beyondmythos', kind: 'project', name: 'BeyondMythos', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Autonomous deployment engine and portfolio project.', evidence: contextEvidence('project:beyondmythos') },
  { id: 'project.supplierwatch', kind: 'project', name: 'SupplierWatch', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Supplier cost monitoring and contract-leak detection.', evidence: contextEvidence('project:supplierwatch') },
  { id: 'project.runwaysignal', kind: 'project', name: 'RunwaySignal', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Thirteen-week cash-flow intelligence system.', evidence: contextEvidence('project:runwaysignal') },
  { id: 'project.dealdiligence', kind: 'project', name: 'DealDiligence', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Property diligence system.', evidence: contextEvidence('project:dealdiligence') },
  { id: 'project.pqc-discovery-migration', kind: 'project', name: 'PQC Discovery & Migration Engine', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Enterprise discovery and migration evidence system for RSA/ECC to post-quantum cryptography.', evidence: contextEvidence('project:pqc-discovery-migration') },
  { id: 'project.photobeam', kind: 'project', name: 'Photobeam', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'PUBLIC', description: 'iOS portfolio project.', metadata: { repository: 'Full-Stack-Assets/Photobeam' }, evidence: contextEvidence('portfolio:photobeam') },
  { id: 'project.the-narrows', kind: 'project', name: 'The Narrows', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'PUBLIC', description: 'Godot game project.', metadata: { repository: 'Full-Stack-Assets/The-Narrows' }, evidence: contextEvidence('portfolio:the-narrows') },
  { id: 'project.moviesrule', kind: 'project', name: 'MoviesRule.com', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'PUBLIC', description: 'Web portfolio project.', metadata: { repository: 'Full-Stack-Assets/-MoviesRule.com' }, evidence: contextEvidence('portfolio:moviesrule') },
  { id: 'project.nextgengear', kind: 'project', name: 'Nextgengear.cc', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'PUBLIC', description: 'Web portfolio project.', metadata: { repository: 'Full-Stack-Assets/Nextgengear.cc' }, evidence: contextEvidence('portfolio:nextgengear') },
  { id: 'project.astrokobi', kind: 'project', name: 'Astrokobi.com', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'PUBLIC', description: 'Web portfolio project.', metadata: { repository: 'Full-Stack-Assets/-Astrokobi.com' }, evidence: contextEvidence('portfolio:astrokobi') },
  { id: 'project.productweld', kind: 'project', name: 'ProductWeld', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'PUBLIC', description: 'Independent studio and reusable product asset portfolio.', evidence: contextEvidence('project:productweld') },
  { id: 'project.aetheria', kind: 'project', name: 'Aetheria', lifecycle: 'active', verification: 'DECLARED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'AI music, SFX, narration, agents, and voice creation surface.', evidence: contextEvidence('project:aetheria') },
  { id: 'project.autonomous-discovery-engine', kind: 'project', name: 'Autonomous Discovery Engine', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Evidence-driven recursive investigation and discovery runtime tracked as an active portfolio system.', evidence: portfolioEvidence() },
  { id: 'project.contra-operator', kind: 'project', name: 'Contra Operator', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Tiered-autonomy profile, marketplace opportunity, and evidence-pack operations.', relationships: [{ type: 'depends_on', targetId: 'project.opportunityos' }], evidence: portfolioEvidence() },
  { id: 'project.margin-leak-monitor', kind: 'project', name: 'Margin Leak Monitor', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Pricing, purchasing, and commercial leakage detection capability family.', relationships: [{ type: 'depends_on', targetId: 'project.hostgraph' }], evidence: portfolioEvidence() },
  { id: 'project.renewallens', kind: 'project', name: 'RenewalLens', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Renewal and recoverable-value intelligence product.', evidence: portfolioEvidence() },
  { id: 'project.bid-radar', kind: 'project', name: 'Bid Radar', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Bid discovery, qualification, evidence, and tracker workflow.', evidence: portfolioEvidence() },
  { id: 'project.wedding-quote-concierge', kind: 'project', name: 'Wedding Quote Concierge', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Vendor comparison and budget coordination service asset.', evidence: portfolioEvidence() },
  { id: 'project.worldline-explorer', kind: 'project', name: 'Worldline Explorer', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Globe-dominant alternate-world exploration and simulation project.', evidence: portfolioEvidence() },
  { id: 'project.cmapss-predictive-maintenance', kind: 'project', name: 'CMAPSS Predictive Maintenance', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Predictive-maintenance model, API, dashboard, and reproducible metrics asset.', evidence: portfolioEvidence() },
  { id: 'project.inflatable-rental-business', kind: 'project', name: 'Inflatable Rental Business', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Local rental operating plan, fleet, pricing, safety, financing, and target registry.', evidence: portfolioEvidence() },
  { id: 'project.active-web-estate', kind: 'project', name: 'Active Web Estate', lifecycle: 'active', verification: 'PARTIAL', health: 'NOT_APPLICABLE', dataClassification: 'PUBLIC', description: 'Fullstackassets.com and related active web properties, deployments, domains, and monetization assets.', evidence: portfolioEvidence() },
  { id: 'project.agentic-ai-role-library', kind: 'project', name: 'Agentic AI Role Library', lifecycle: 'active', verification: 'VERIFIED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL', description: 'Reusable governed role, skill, integration, authority, handoff, and organizational-model library.', relationships: [{ type: 'uses', targetId: 'catalog.agentic-role-library' }, { type: 'uses', targetId: 'catalog.agentic-skill-library' }, { type: 'uses', targetId: 'catalog.agentic-integration-library' }], evidence: libraryEvidence('README:Agentic AI Role Library') },

  {
    id: 'repository.opportunityos', kind: 'repository', name: 'Full-Stack-Assets/OpportunityOS', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'PUBLIC',
    description: 'Current canonical Git checkout containing OpportunityOS and the embedded BuildGraph implementation.',
    canonicalRef: 'https://github.com/Full-Stack-Assets/OpportunityOS',
    metadata: { defaultBranch: 'main', observedCommit: '6903279c40c61b5088acf7c5ad3341cb0075ed37', writePermissionVerified: true },
    evidence: githubEvidence('Full-Stack-Assets/OpportunityOS', true),
  },

  {
    id: 'catalog.agentic-role-library', kind: 'catalog', name: 'Agentic AI Role Library', lifecycle: 'active', verification: 'VERIFIED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Canonical role catalog packaged as portable SKILL.md role definitions.',
    canonicalRef: 'library:role-skills.csv',
    metadata: { roleSkills: 131, stableBaseRoles: 123, sectorOverlays: 8, sourceArchiveSha256: '6adfcd3e6b192ff75e33891a1aa2f9b9861d071f44c729b59c87a88ad1e91d90', deterministicSkillTreeSha256: 'cc0929250b24481b970b879152f546b4884c499e0d9031228ab542058330eb1c' },
    evidence: libraryEvidence('VALIDATION_REPORT.md'),
  },
  {
    id: 'catalog.agentic-skill-library', kind: 'catalog', name: 'Reusable Agentic Skill Catalog', lifecycle: 'active', verification: 'VERIFIED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Reusable capability catalog SKL-001 through SKL-045.', canonicalRef: 'library:03_SKILL_AND_INTEGRATION_CATALOG.md', metadata: { skillCount: 45, firstId: 'SKL-001', lastId: 'SKL-045' }, evidence: libraryEvidence('03_SKILL_AND_INTEGRATION_CATALOG.md'),
  },
  {
    id: 'catalog.agentic-integration-library', kind: 'catalog', name: 'Agentic Integration Catalog', lifecycle: 'active', verification: 'VERIFIED', health: 'NOT_APPLICABLE', dataClassification: 'INTERNAL',
    description: 'Least-privilege integration categories INT-001 through INT-020 with permission tiers I0 through I4.', canonicalRef: 'library:03_SKILL_AND_INTEGRATION_CATALOG.md', metadata: { integrationCategories: 20, permissionTiers: 5, firstId: 'INT-001', lastId: 'INT-020' }, evidence: libraryEvidence('03_SKILL_AND_INTEGRATION_CATALOG.md'),
  },

  {
    id: 'integration.github', kind: 'integration', name: 'GitHub', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'INTERNAL',
    description: 'Repository, branch, file, issue, pull-request, and workflow integration.', capabilities: ['repository.read', 'repository.write', 'branch.create', 'file.write'],
    relationships: [{ type: 'provides', targetId: 'repository.opportunityos' }], metadata: { adapter: 'ChatGPT GitHub connector', permissionObserved: 'admin/maintain/push/pull/triage' }, evidence: githubEvidence('connector:get_repo:Full-Stack-Assets/OpportunityOS', true),
  },
  {
    id: 'integration.chatgpt-library', kind: 'integration', name: 'ChatGPT Files / Library', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'RESTRICTED',
    description: 'Persistent document/file retrieval surface used for canonical architecture and role-library source records.', capabilities: ['knowledge.search', 'knowledge.read', 'file.materialize'], evidence: libraryEvidence('files:library-search'),
  },
  {
    id: 'integration.chatgpt-automations', kind: 'integration', name: 'ChatGPT Automations', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'RESTRICTED',
    description: 'Scheduled and condition-watch task runtime. Private task payloads remain outside the public repository.', capabilities: ['automation.inspect', 'automation.schedule', 'automation.update'], evidence: [{ sourceType: 'automation', sourceRef: 'automation-registry-snapshot', observedAt, verified: true }],
  },
  { id: 'integration.gmail', kind: 'integration', name: 'Gmail', lifecycle: 'active', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'RESTRICTED', description: 'Email read/write integration; connection health is not asserted by inventory seeding.', capabilities: ['mail.read', 'mail.write'], evidence: contextEvidence('integration:gmail') },
  { id: 'integration.google-drive', kind: 'integration', name: 'Google Drive', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'RESTRICTED', description: 'Connected document/file source with successful BuildGraph and agentic-content search probes.', capabilities: ['drive.read', 'drive.search'], evidence: systemEvidence('provider-probe:google-drive:search-buildgraph') },
  { id: 'integration.clickup', kind: 'integration', name: 'ClickUp', lifecycle: 'active', verification: 'PARTIAL', health: 'DEGRADED', dataClassification: 'INTERNAL', description: 'Connected work-management surface; search is available while workspace hierarchy discovery is blocked by a connector schema mismatch.', capabilities: ['tasks.read', 'tasks.write', 'workflow.events'], evidence: systemEvidence('provider-probe:clickup:search-ok+hierarchy-schema-mismatch') },
  { id: 'integration.wisebase', kind: 'integration', name: 'AI Wisebase', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'RESTRICTED', description: 'Durable operational knowledge layer with successful canonical BuildGraph retrieval.', capabilities: ['knowledge.search', 'knowledge.store'], evidence: systemEvidence('provider-probe:wisebase:canonical-buildgraph-query') },
  { id: 'integration.airtable', kind: 'integration', name: 'Airtable', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'RESTRICTED', description: 'Connected structured operational-data surface with successful base and table-schema reads.', capabilities: ['structured-data.read', 'structured-data.write', 'schema.read'], relationships: [{ type: 'source_for', targetId: 'project.aetheria' }], metadata: { observedBases: 2, observedOperationalTables: 8 }, evidence: systemEvidence('provider-probe:airtable:list-bases+list-tables') },
  { id: 'integration.ideabrowser', kind: 'integration', name: 'Ideabrowser', lifecycle: 'active', verification: 'PARTIAL', health: 'UNAVAILABLE', dataClassification: 'INTERNAL', description: 'Configured startup research/build surface that cannot execute in this conversation because developer MCPs are forbidden on the current surface.', capabilities: ['startup-research', 'project-context', 'market-insight'], evidence: systemEvidence('provider-probe:ideabrowser:developer-mcp-forbidden') },
  { id: 'integration.openai-platform', kind: 'integration', name: 'OpenAI Platform', lifecycle: 'active', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'RESTRICTED', description: 'OpenAI Platform connector surface reserved for secure API-key setup and project-target selection when required.', capabilities: ['api-key.setup'], evidence: contextEvidence('integration:openai-platform') },
  { id: 'integration.canonical-memory-verifier', kind: 'integration', name: 'Canonical Memory Verifier', lifecycle: 'active', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'Canonical-memory validation plugin surface; no callable verification probe was available in this unit.', capabilities: ['canonical-memory.verify'], evidence: contextEvidence('integration:canonical-memory-verifier') },
  { id: 'integration.contra', kind: 'integration', name: 'Contra', lifecycle: 'active', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'RESTRICTED', description: 'Marketplace opportunity/account integration.', capabilities: ['marketplace.read', 'marketplace.write'], evidence: contextEvidence('integration:contra') },
  { id: 'integration.freelancer', kind: 'integration', name: 'Freelancer.com', lifecycle: 'active', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'RESTRICTED', description: 'Marketplace integration target with persistent OAuth requirement.', capabilities: ['marketplace.read', 'marketplace.write'], evidence: contextEvidence('integration:freelancer') },
  { id: 'integration.reddit', kind: 'integration', name: 'Reddit', lifecycle: 'active', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'PUBLIC', description: 'Public demand-signal source.', capabilities: ['public-demand.read'], evidence: contextEvidence('integration:reddit') },
  { id: 'integration.hacker-news', kind: 'integration', name: 'Hacker News', lifecycle: 'active', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'PUBLIC', description: 'Public demand-signal source.', capabilities: ['public-demand.read'], evidence: contextEvidence('integration:hacker-news') },
  { id: 'integration.elevenlabs', kind: 'integration', name: 'ElevenLabs', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'RESTRICTED', description: 'Voice/music generation and marketplace integration target for artist systems.', capabilities: ['audio.generate', 'voice.use', 'media.publish'], evidence: contextEvidence('integration:elevenlabs') },
  { id: 'integration.youtube', kind: 'integration', name: 'YouTube', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'RESTRICTED', description: 'Media publishing and analytics integration target.', capabilities: ['media.publish', 'analytics.read'], evidence: contextEvidence('integration:youtube') },

  {
    id: 'runtime.chatgpt', kind: 'runtime', name: 'ChatGPT', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'INTERNAL', description: 'Primary interactive command, orchestration, reasoning, and connected-tool runtime.', capabilities: ['reasoning', 'tool-use', 'artifact-generation', 'automation'], evidence: systemEvidence('current-runtime:chatgpt') },
  { id: 'runtime.codex', kind: 'runtime', name: 'OpenAI Codex', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'Target software-engineering execution runtime.', capabilities: ['code.execute', 'repository.modify', 'tests.run'], evidence: contextEvidence('runtime:codex') },
  { id: 'runtime.cursor', kind: 'runtime', name: 'Cursor', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'Target repository implementation and background-agent runtime.', capabilities: ['code.execute', 'repository.modify', 'tests.run'], evidence: contextEvidence('runtime:cursor') },
  { id: 'runtime.grok', kind: 'runtime', name: 'Grok', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'Target realtime intelligence and independent reasoning runtime.', capabilities: ['reasoning', 'realtime-research'], evidence: contextEvidence('runtime:grok') },
  { id: 'runtime.manus', kind: 'runtime', name: 'Manus', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'Target long-horizon cloud operator and browser-heavy execution runtime.', capabilities: ['browser-operations', 'long-horizon-execution', 'artifact-generation'], evidence: contextEvidence('runtime:manus') },
  { id: 'runtime.claude-code', kind: 'runtime', name: 'Claude Code', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'Target independent engineering and verification runtime.', capabilities: ['code.execute', 'code.review', 'verification'], evidence: contextEvidence('runtime:claude-code') },
  { id: 'runtime.github-actions', kind: 'runtime', name: 'GitHub Actions', lifecycle: 'active', verification: 'PARTIAL', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'CI and deterministic verification runtime; workflow exists but current run health is not asserted.', capabilities: ['ci.execute', 'tests.run', 'build.run'], evidence: githubEvidence('Full-Stack-Assets/OpportunityOS:.github/workflows/ci.yml', true) },
  { id: 'runtime.n8n', kind: 'runtime', name: 'n8n', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'Target event/webhook integration edge.', capabilities: ['events.ingest', 'workflow.trigger', 'mcp.bridge'], evidence: contextEvidence('runtime:n8n') },
  { id: 'runtime.temporal', kind: 'runtime', name: 'Temporal', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'Target durable workflow execution substrate.', capabilities: ['workflow.durable', 'workflow.resume', 'human-wait'], evidence: contextEvidence('runtime:temporal') },
  { id: 'runtime.langgraph', kind: 'runtime', name: 'LangGraph', lifecycle: 'planned', verification: 'DECLARED', health: 'UNKNOWN', dataClassification: 'INTERNAL', description: 'Optional stateful graph runtime for agent-level orchestration.', capabilities: ['agent.graph', 'checkpointing', 'human-interrupt'], evidence: contextEvidence('runtime:langgraph') },

  {
    id: 'automation.chatgpt-inventory', kind: 'automation', name: 'ChatGPT Automation Registry Snapshot', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'RESTRICTED',
    description: 'Aggregate registry record for existing scheduled/condition-watch automations. Private prompts, IDs, and unrelated task names are intentionally not persisted in the public codebase.',
    metadata: { observedTotal: 10, enabled: 7, paused: 3, privatePayloadsPersisted: false },
    relationships: [{ type: 'executes_on', targetId: 'runtime.chatgpt' }], evidence: [{ sourceType: 'automation', sourceRef: 'automation-registry-snapshot', observedAt, verified: true }],
  },
  {
    id: 'automation.ai-frontier-monitor', kind: 'automation', name: 'AI Frontier Monitor', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'INTERNAL',
    description: 'Hourly condition-watch for substantive AI model, system, capability, security, and enabling-technology advances.', metadata: { cadence: 'hourly', timingMode: 'condition_watch' }, relationships: [{ type: 'executes_on', targetId: 'runtime.chatgpt' }], evidence: [{ sourceType: 'automation', sourceRef: 'AI Frontier Monitor', observedAt, verified: true }],
  },
  {
    id: 'automation.freelance-opportunity-watch', kind: 'automation', name: 'Freelance Opportunity Watch', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'INTERNAL',
    description: 'Hourly condition-watch for high-fit freelance, contracting, public demand, and inbound client signals.', metadata: { cadence: 'hourly', timingMode: 'condition_watch' }, relationships: [{ type: 'executes_on', targetId: 'runtime.chatgpt' }, { type: 'tracks', targetId: 'project.opportunityos' }], evidence: [{ sourceType: 'automation', sourceRef: 'Freelance Opportunity Watch', observedAt, verified: true }],
  },
  {
    id: 'automation.inbox-opportunity-check', kind: 'automation', name: 'All-Inbox Opportunity Reply Check', lifecycle: 'active', verification: 'VERIFIED', health: 'HEALTHY', dataClassification: 'RESTRICTED',
    description: 'Daily scan of accessible email inboxes for worthwhile human opportunity replies and requested actions.', metadata: { cadence: 'daily', timingMode: 'flexible_schedule' }, relationships: [{ type: 'executes_on', targetId: 'runtime.chatgpt' }, { type: 'tracks', targetId: 'project.opportunityos' }], evidence: [{ sourceType: 'automation', sourceRef: 'All-Inbox Opportunity Reply Check', observedAt, verified: true }],
  },
];
