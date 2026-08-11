# Threat Model — Release 0.1.0-simulation

## Assets

- Human approvals and signatures
- BuildGraph preflight decisions
- Opportunity source evidence
- WorkOrder state
- Factory inputs and outputs
- Verification evidence
- Economic records
- Receipt chain integrity
- Provider credentials (future; not stored in this repository)

## Main threats and controls

| Threat | Control |
|---|---|
| Approval replay or mutation | Action ID + action type + canonical payload hash + expiry + signature verifier |
| Factory self-authorization | Trust Kernel is a separate module/domain; factory contract has no approval mutation API |
| Duplicate work | BuildGraph preflight is mandatory and fails closed |
| Fake completion | Independent verifier recomputes artifact checksum before `COMPLETED` |
| Receipt tampering | Every receipt binds the prior receipt hash |
| Fabricated financial performance | Integer cents only; unknown values remain undefined; contribution requires complete evidence |
| Invalid dependency execution | Requirements compiler rejects missing dependencies and cycles |
| Accidental live action | Release execution mode is simulation-only; PostgreSQL schema constrains it to `SIMULATION` |
| Secret exposure | `.env*` ignored except `.env.example`; no credentials committed |

## Residual risks

- Signature verification is injected but no production identity provider is activated yet.
- PostgreSQL migration is not live-verified in the current sandbox because no PostgreSQL service is available.
- The Next.js dependency graph cannot be clean-room installed in the current sandbox because npm registry access is unavailable.
- BuildGraph live API authentication and persistence are environment-dependent and are not claimed as active here.
