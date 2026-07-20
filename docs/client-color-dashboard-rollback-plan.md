# Client Color and Dashboard Rollback Plan

## Principle

The migration is additive. Normal rollback preserves `ClientColorKey`, `clients.colorKey`, and any client selections. Dropping the enum/column is not an operational rollback step.

## Scenarios

### Migration fails before commit

- Do not deploy either application.
- Confirm the one-shot transaction rolled back and no finished candidate migration row exists.
- Preserve the existing production runtime and investigate from sanitized metadata.

### Migration succeeds, backend fails

- Do not deploy the frontend.
- Restore the previously proven backend artifact.
- The old backend remains compatible with the additive schema and ignores `colorKey`.
- Keep the enum and nullable column; do not erase values.

### Backend succeeds, frontend fails

- Keep the migrated DB and new backend.
- Restore the previous frontend artifact only.
- The old frontend ignores the additional DTO field.

### Post-deploy backend defect

- Restore the previous backend and, if needed, previous frontend artifacts.
- Keep the additive schema.
- Confirm health, authentication, TaskSubmission workflow, communications gate behavior, Client Portal guard, and core routes.

### Post-deploy UI defect

- Roll back the frontend artifact first.
- Roll back the backend only if the defect is contract-related and the previous backend is needed.
- Preserve saved `colorKey` selections for the next corrected deployment.

## Destructive rollback exception

Dropping `clients.colorKey` or `ClientColorKey` would destroy user selections and can block on dependencies. It requires a separate data-retention assessment, explicit approval, a new reviewed migration, clone proof, and production runbook. It is never part of routine incident rollback.

## Evidence to retain

- Exact SQL checksum and migration record.
- Before/after metadata proof.
- Backend/frontend deployment IDs.
- Route and authenticated smoke results.
- Reason for rollback and selected artifact versions.
- Confirmation that no client data was manually rewritten.
