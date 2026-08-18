import { AGENT_ROLE_INVENTORY, AGENT_SKILL_INVENTORY } from './agentic-catalog-records.ts';
import { CANONICAL_ARCHITECTURE_INVENTORY as BASE_ARCHITECTURE_INVENTORY } from './agentic-inventory.ts';
import type { CanonicalRegistryRecord } from './agentic-registry.ts';
import { GITHUB_REPOSITORY_INVENTORY } from './github-repository-inventory.ts';

const supplementalRepositories = GITHUB_REPOSITORY_INVENTORY.filter(
  (record) => record.id !== 'repository.opportunityos',
);

export const CANONICAL_ARCHITECTURE_INVENTORY: CanonicalRegistryRecord[] = [
  ...BASE_ARCHITECTURE_INVENTORY,
  ...supplementalRepositories,
  ...AGENT_ROLE_INVENTORY,
  ...AGENT_SKILL_INVENTORY,
];
