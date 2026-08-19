# Release Evidence Matrix

| Capability | Release 0.1 evidence | Status |
|---|---|---|
| Canonical hashing | Node behavioral test | Verified locally |
| Payload-bound approval | Node behavioral test + orchestration denial-without-approval test | Verified locally |
| Receipt chaining | Node behavioral test | Verified locally |
| Opportunity ranking | Node behavioral test | Verified locally |
| WorkOrder FSM | Node behavioral test | Verified locally |
| Requirements DAG | Node behavioral test | Verified locally |
| BuildGraph fail-closed gate | Node behavioral test | Verified locally |
| Independent artifact verification | Node behavioral test | Verified locally |
| Honest economics | Node behavioral test | Verified locally |
| Simulation orchestration | Node behavioral test + smoke | Verified locally |
| Buyer demo (non-authorizing investigation) | `npm run demo` | Verified locally; `externalActionAllowed = false` |
| PostgreSQL adapter behavior | Node behavioral tests | Verified locally |
| PostgreSQL live migration | Requires live PostgreSQL | Pending external environment |
| Full npm clean-room install | Requires npm registry access | Pending external environment |
| Next.js production build | Requires dependency installation | Pending external environment |
| Authenticated BuildGraph round-trip | Requires running/authenticated BuildGraph | Pending external environment |
| Live external platform actions | Out of scope for `0.1.0-simulation` | Disabled |
