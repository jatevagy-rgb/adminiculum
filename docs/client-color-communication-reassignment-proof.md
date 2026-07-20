# Client Color Communication Reassignment Proof

## Finding

The case-link route originally updated only `caseId`. A communication could therefore point to Beta's case while retaining Alpha's persisted `clientId` and RED accent.

## Correction

`POST /api/v1/communications/:id/link-case` now updates both:

- `caseId` from the selected case;
- `clientId` from that case's persisted `clientId`.

No sender, subject, domain, or payload inference is used.

## Proof

With synthetic data, an Alpha/RED communication was linked to Beta's case. After backend success and refresh, list and selected detail both reported Beta and BLUE; the old RED accent disappeared. A focused route test repeats the reassignment and verifies the refreshed list DTO plus one batched client query.

Existing unassigned communication rows remain `clientId: null` and visually neutral. The route contract has no clear-client operation, so no new mutation was invented.
