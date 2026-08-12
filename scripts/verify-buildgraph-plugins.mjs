import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const registeredTools = new Set([
  'buildgraph_list_capabilities',
  'buildgraph_resolve_workflow',
  'buildgraph_check_readiness',
  'buildgraph_verify_completion',
  'buildgraph_capability_gaps',
]);

const pluginsRoot = new URL('../plugins/', import.meta.url);
const skillsRoot = new URL('../skills/', import.meta.url);
const pluginDirs = readdirSync(pluginsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

assert.deepEqual(pluginDirs, [
  'buildgraph-delivery',
  'buildgraph-discovery',
  'buildgraph-fulfillment',
  'buildgraph-planner',
  'buildgraph-verifier',
]);

for (const directory of pluginDirs) {
  const path = new URL(`${directory}/plugin.json`, pluginsRoot);
  const profile = JSON.parse(readFileSync(path, 'utf8'));

  assert.equal(profile.schemaVersion, 1, `${directory} must use schemaVersion 1`);
  assert.equal(profile.authority?.readOnly, true, `${directory} must remain read-only`);
  assert.equal(profile.authority?.consequentialWrites, false, `${directory} must not authorize consequential writes`);
  assert.equal(profile.authority?.humanApprovalRequiredForWrites, true, `${directory} must preserve human approval for writes`);
  assert.ok(Array.isArray(profile.allowedTools) && profile.allowedTools.length > 0, `${directory} must allow at least one tool`);
  assert.ok(Array.isArray(profile.skills) && profile.skills.length > 0, `${directory} must reference at least one skill`);

  for (const tool of profile.allowedTools) {
    assert.ok(registeredTools.has(tool), `${directory} references unregistered tool ${tool}`);
  }

  for (const skill of profile.skills) {
    const skillFile = join(skillsRoot.pathname, skill, 'SKILL.md');
    assert.ok(existsSync(skillFile), `${directory} references missing skill ${skill}`);
  }
}

const serverSource = readFileSync(new URL('../apps/buildgraph-mcp/src/server.ts', import.meta.url), 'utf8');
for (const tool of registeredTools) {
  assert.ok(serverSource.includes(`'${tool}'`), `MCP server does not register ${tool}`);
}

const readOnlyAnnotations = serverSource.match(/readOnlyHint:\s*true/g) ?? [];
assert.equal(readOnlyAnnotations.length, registeredTools.size, 'every BuildGraph MCP tool must be explicitly read-only');
assert.ok(!serverSource.includes('readOnlyHint: false'), 'BuildGraph MCP first tranche must not expose write tools');

console.log(`Verified ${pluginDirs.length} BuildGraph plugin profiles and ${registeredTools.size} read-only MCP tools.`);
