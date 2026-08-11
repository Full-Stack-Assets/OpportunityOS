export interface Requirement {
  id: string;
  description: string;
  dependsOn: string[];
}

export interface CompiledRequirements {
  requirements: Requirement[];
  order: string[];
}

export function compileRequirements(requirements: Requirement[]): CompiledRequirements {
  const byId = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  if (byId.size !== requirements.length) throw new Error('Requirement IDs must be unique');
  for (const requirement of requirements) {
    for (const dependency of requirement.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`Missing requirement dependency: ${dependency}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Requirement dependency cycle detected at ${id}`);
    visiting.add(id);
    const requirement = byId.get(id);
    if (!requirement) throw new Error(`Unknown requirement: ${id}`);
    for (const dependency of [...requirement.dependsOn].sort()) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };

  for (const id of [...byId.keys()].sort()) visit(id);
  return { requirements: [...requirements], order };
}
