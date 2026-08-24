# Shared Acquisition Fabric Foundation v1 — Normative Interface Correction

**Applies to:** `docs/superpowers/plans/2026-08-24-shared-acquisition-fabric-foundation-v1.md`  
**Status:** Normative; read before execution  
**Reason:** The provider adapter cannot know `payloadRef`, `payloadHash`, or `receiptHash` before the atomic ingestion transaction. The original plan correctly assigns those values to persistence, but its initial `CollectionResult` type incorrectly used the finalized `SourceObservation` type.

This correction supersedes only the affected interface snippets and test property names. Every other task, boundary, test requirement, and stop condition in the implementation plan remains unchanged.

## Correct Contract Boundary

Provider adapters emit a validated, non-persistent `SourceObservationDraft` plus the source payload. The ingestion transaction encrypts and persists the payload, computes the collector receipt, and finalizes the immutable `SourceObservation` with `payloadRef`, `payloadHash`, and `receiptHash`.

```ts
// packages/contracts/src/observation.ts
import { z } from 'zod';

export const SourceObservationDraftSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  connectionId: z.string().min(1).nullable(),
  sourceType: z.enum(['marketplace_project', 'inbound_message', 'public_demand', 'profile', 'other']),
  externalId: z.string().min(1).nullable(),
  canonicalUrl: z.string().url().nullable(),
  recordKind: z.enum(['buyer_opportunity', 'service_listing', 'message', 'public_signal', 'other']),
  observedAt: z.string().datetime(),
  retrievedAt: z.string().datetime(),
  retrievalMethod: z.string().min(1),
  verified: z.boolean(),
  contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRevision: z.string().min(1).nullable(),
  queryAttribution: z.array(z.object({
    familyId: z.string().min(1),
    version: z.string().min(1)
  }).strict()),
  provenanceRefs: z.array(z.string().min(1)),
  sourcePermissions: z.record(z.string(), z.unknown())
}).strict();

export const SourceObservationSchema = SourceObservationDraftSchema.extend({
  payloadRef: z.string().min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

export type SourceObservationDraft = z.infer<typeof SourceObservationDraftSchema>;
export type SourceObservation = z.infer<typeof SourceObservationSchema>;
```

```ts
// packages/contracts/src/provider.ts
import type { SourceObservationDraft } from './observation.ts';

export interface CollectionCandidate {
  draft: SourceObservationDraft;
  payload: unknown;
}

export interface CollectionResult {
  candidates: CollectionCandidate[];
  nextCursor: unknown;
  healthBefore: ConnectionRecord['status'];
  healthAfter: ConnectionRecord['status'];
  rejected: Array<{ sourceId: string | null; reason: string }>;
  requestFingerprint: string;
  resultFingerprint: string;
  failureCode: string | null;
  failureDetail: string | null;
}
```

## Correct Adapter Assertions

Replace references such as:

```ts
result.observations[0]?.observation.externalId
```

with:

```ts
result.candidates[0]?.draft.externalId
```

Unsuccessful provider calls return:

```ts
{
  candidates: [],
  nextCursor: input.cursor,
  healthBefore,
  healthAfter,
  rejected: [],
  requestFingerprint,
  resultFingerprint,
  failureCode,
  failureDetail
}
```

## Correct Atomic Finalization Order

`IngestionRepository.commitSuccess()` must perform the following inside one database transaction:

1. Acquire a provider/account-scoped transaction advisory lock so concurrent partitions cannot calculate conflicting dedup counts.
2. Redact and encrypt every candidate payload in memory, producing deterministic `payloadHash` values and caller-generated `payloadRef` values.
3. Determine which candidate observation identities already exist under the unique observation index.
4. Compute verified and deduplicated counts from that locked database state.
5. Build and hash the collector receipt, including `previousReceiptHash` from the leased partition.
6. Insert the collector run with its final `receiptHash`.
7. Insert encrypted payload rows for new observations only.
8. Finalize each new draft into `SourceObservation` by adding `payloadRef`, `payloadHash`, and `receiptHash`; validate through `SourceObservationSchema`; insert it.
9. Insert one `ObservationPersisted` outbox event for each newly inserted observation.
10. Advance cursor, receipt chain, health, and `next_run_at`; release the lease.
11. Commit.

A suitable lock key is deterministic over provider and connection context:

```ts
const lockIdentity = `${partition.provider}\u0000${partition.connectionId ?? ''}`;
await client.query('select pg_advisory_xact_lock(hashtext($1))', [lockIdentity]);
```

`PayloadRepository.put()` therefore accepts an optional caller-supplied reference:

```ts
put(client, {
  payloadRef,
  value: candidate.payload,
  keyVersion: 'payload-key-v1'
}): Promise<{ payloadRef: string; payloadHash: string }>;
```

Use:

```ts
const payloadRef = `payload:${candidate.draft.id}:${randomUUID()}`;
```

## Correct Receipt Responsibility

The provider adapter computes request and result fingerprints but does **not** create the collector receipt. The ingestion layer owns receipt construction because it alone knows:

- previous receipt hash;
- durable duplicate count;
- final payload hashes;
- final committed observation count;
- cursor actually committed.

## Correct Self-Review Statement

Read the original plan's type-consistency section as:

> `ProviderAdapter.collect()` returns `CollectionCandidate[]` containing `SourceObservationDraft` plus payload. `IngestionRepository.commitSuccess()` finalizes those drafts into immutable `SourceObservation` records after payload and receipt values are known.

This correction removes the only identified cross-task type contradiction without widening scope or adding provider writes.