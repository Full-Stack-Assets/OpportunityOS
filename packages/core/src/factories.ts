import { hashCanonical } from './canonical.ts';
import type { CompiledRequirements } from './requirements.ts';

export type FactoryKind = 'SOFTWARE_WEB' | 'RESEARCH_DOCUMENTS' | 'AUTOMATION';

export interface FactoryArtifact {
  id: string;
  kind: FactoryKind;
  content: string;
  checksum: string;
  simulation: true;
}

export function simulateFactory(kind: FactoryKind, compiled: CompiledRequirements): FactoryArtifact {
  const content = JSON.stringify({
    executionMode: 'SIMULATION',
    factory: kind,
    requirementOrder: compiled.order,
    requirements: compiled.requirements.map(({ id, description }) => ({ id, description })),
  });
  return {
    id: `artifact-${hashCanonical({ kind, order: compiled.order }).slice(0, 16)}`,
    kind,
    content,
    checksum: hashCanonical(content),
    simulation: true,
  };
}
