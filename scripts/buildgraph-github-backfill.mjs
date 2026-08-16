import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { createIngestionReceipt, ingestGitHubRepository } from '../packages/core/src/index.ts';

const DEFAULT_FIXTURE = new URL('../data/buildgraph/github-repositories.fixture.json', import.meta.url);

function normalizeRepository(raw, observedAt) {
  const id = String(raw.id ?? '').trim();
  const name = String(raw.name ?? '').trim();
  const fullName = String(raw.fullName ?? raw.full_name ?? raw.repository_full_name ?? '').trim();
  const url = String(raw.url ?? raw.html_url ?? raw.display_url ?? '').trim();
  const visibility = String(raw.visibility ?? (raw.private ? 'private' : 'public')).trim();
  const defaultBranch = String(raw.defaultBranch ?? raw.default_branch ?? 'main').trim();
  const size = Number(raw.size ?? 0);
  const archived = Boolean(raw.archived);
  const searchIndexed = raw.searchIndexed ?? raw.is_code_search_indexed;
  const timestamp = String(raw.observedAt ?? raw.observed_at ?? observedAt).trim();

  if (!id || !name || !fullName || !url) throw new TypeError('Repository requires id, name, fullName, and url');
  if (!Number.isFinite(size) || size < 0) throw new TypeError(`Invalid repository size for ${fullName}`);

  return {
    id,
    name,
    fullName,
    url,
    visibility,
    defaultBranch,
    size,
    archived,
    ...(typeof searchIndexed === 'boolean' ? { searchIndexed } : {}),
    observedAt: timestamp,
  };
}

async function loadInventory() {
  const pathArg = process.argv[2];
  if (pathArg === '--stdin') {
    let data = '';
    for await (const chunk of process.stdin) data += chunk;
    return JSON.parse(data);
  }
  const source = pathArg ? new URL(`file://${process.cwd()}/${pathArg}`) : DEFAULT_FIXTURE;
  return JSON.parse(await readFile(source, 'utf8'));
}

const rawInventory = await loadInventory();
if (!Array.isArray(rawInventory)) throw new TypeError('Repository inventory must be an array');

const observedAt = process.env.BUILDGRAPH_OBSERVED_AT ?? new Date().toISOString();
const rows = [];
const failures = [];
let archived = 0;

for (let index = 0; index < rawInventory.length; index += 1) {
  try {
    const repository = normalizeRepository(rawInventory[index], observedAt);
    const ingestion = ingestGitHubRepository(repository);
    rows.push({
      source: ingestion.source,
      entities: [ingestion.repository, ingestion.project],
      relationships: [ingestion.relationship],
    });
    if (repository.archived) archived += 1;
  } catch (error) {
    failures.push({ index, reason: error instanceof Error ? error.message : 'unknown_error' });
  }
}

const stats = {
  attempted: rawInventory.length,
  linked: 0,
  updated: 0,
  createdCandidates: rows.length,
  review: 0,
  skipped: 0,
  failed: failures.length,
};
const receipt = createIngestionReceipt('github', observedAt, stats);

for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`);
process.stderr.write(`${JSON.stringify({
  source: 'github',
  attempted: rawInventory.length,
  transformed: rows.length,
  archived,
  failures,
  receipt,
})}\n`);

if (failures.length > 0) process.exitCode = 2;
