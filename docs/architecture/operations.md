# Operations

## Release gate

A release is acceptable only when:

1. Core behavioral tests pass.
2. Strict core and PostgreSQL TypeScript checks pass.
3. Smoke run ends `COMPLETED`, independently verified, `SIMULATION`, with `externalSideEffects = 0`.
4. Full workspace dependencies install from the registry.
5. Control-plane and worker typechecks/builds pass.
6. PostgreSQL migration is applied to a disposable database and rollback/recovery is exercised before any production binding.
7. BuildGraph endpoint is authenticated and a real preflight round-trip is recorded.
8. No live provider adapter is enabled without its own explicit activation and verification matrix.

## Database activation

Apply `database/migrations/001_initial.sql` only to a disposable PostgreSQL environment first. Verify all constraints, foreign keys, and indexes. Production credentials must come from secret management, never source control.

## Incident behavior

Ambiguity fails closed. Invalid approvals, BuildGraph failures, verification mismatches, unexpected execution mode, or persistence errors must move work to `NEEDS_YOU` or `FAILED`; they must not be converted into successful receipts.
