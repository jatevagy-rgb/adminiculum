# Internal submission acceptance

`POST /api/v1/internal/client-interaction/submissions/:id/accept-compliance`

Uses the existing authenticated workforce role and case-access gates. The server
derives client, case, request, reviewer, and review time. Caller review metadata
is not authoritative. The existing correction, rejection and file-only acceptance
routes retain their separate meanings.

Evidence example:

```json
{
  "outcome": "ACCEPT_EVIDENCE",
  "expectedRevision": 0,
  "reason": "Checked the supplied document",
  "fileId": "submission-file-id",
  "title": "Supporting document"
}
```

For a CLEAN unaccepted file, the command uses the existing acceptance service to
create its canonical immutable version in the same transaction. Optional
`documentId` selects an authorized destination in this submission's case. For an
already accepted file, its persisted exact version is used; optional
`documentVersionId` and `documentId` must match. No current/latest version fallback
exists. Historical files without per-file version provenance return
`409 EXACT_FILE_VERSION_UNAVAILABLE`; no historical acceptance is fabricated.

Optional `clientControlId` must belong to the same client and match the request's
control when present. Otherwise the request's existing control is used. Linking
accepted evidence never changes the control's implementation status.

Fact example:

```json
{
  "outcome": "ACCEPT_FACT",
  "expectedRevision": 0,
  "reason": "Confirmed the submitted answer",
  "fieldId": "submission-field-id",
  "factDefinitionId": "canonical-fact-definition-id",
  "fact": { "scopeType": "COMPANY", "booleanValue": true }
}
```

Facts require a source answer (`fieldId`) or file (`fileId`) from this submission.
The reviewer explicitly supplies the typed interpretation; canonical fact type,
scope, temporal and overlap validation still applies. The server overrides source
reference, source document version, verification status and evaluation time.
Answer text is snapshotted in the internal receipt so later correction cannot
erase the provenance of the decision.

The response is the internal historical acceptance receipt, also available under
`complianceAcceptance` in the existing internal submission GET. It includes
source identities, resulting fact/evidence IDs, reason, authenticated reviewer,
server time and reevaluation result. Read the canonical fact/evidence record for
its subsequent lifecycle state. Customer submission DTOs omit this receipt and
the per-file internal version pointer.

All writes and canonical reconciliation run in one serializable transaction.
An error rolls back the file/version, fact/evidence, links and receipt. A completed
evaluation is reported only after success; a non-enrolled client reports
`NOT_ENROLLED` with zero evaluations. Acceptance neither completes the request nor
infers control implementation or legal compliance.

Only one Compliance acceptance receipt is allowed per submission. Repeats return
`409 COMPLIANCE_ALREADY_ACCEPTED`; concurrent decisions return that conflict or
`409 COMPLIANCE_DECISION_CONFLICT`. No duplicate fact/evidence is created.
Correction/rejection/unavailability remains on the existing review routes and
does not imply Compliance acceptance.

## Verification

Replay canonical migrations with `scripts/verify-migration-replay.mjs` against an
isolated disposable PostgreSQL database, then set
`COMPLIANCE_ACCEPTANCE_TEST_DATABASE_URL` (or `MIGRATION_REPLAY_DATABASE_URL`) and
run `jest --runInBand tests/submissionComplianceAcceptance.integration.test.ts`.
The tests use real persistence and transaction failures; only token verification
is substituted in the mounted-route test. No storage/network or live-user
acceptance is claimed by this suite.
