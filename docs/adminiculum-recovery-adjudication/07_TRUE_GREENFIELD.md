# True greenfield adjudication

## Persisted workforce/Outlook thread, unread, and reply state

- Classification: `TRUE_GREENFIELD` for the Outlook/workforce domain.
- Partial adjacent evidence: `Communication.providerConversationId` groups imported messages; `ClientQuestionThread` has participant/read state for the customer-interaction domain.
- Why not recovery: neither is a persisted workforce mailbox thread state machine. Reusing portal tables would collapse portal/workforce separation.
- Required foundation: thread identity, participant/mailbox scope, unread cursor semantics, reply-needed derivation, idempotent provider synchronization, safe DTO, retention/audit.

## Outgoing mail

- Classification: `TRUE_GREENFIELD`.
- Partial adjacent evidence: inbound Graph reader/import and client-interaction answer notification.
- Why not recovery: no Graph send command, outbox, idempotency, recipient authorization, attachment policy, delivery state, or retry contract is proven.
- Required foundation: authorized compose command, case/client recipient resolution, attachment object authorization and SEC-2 scanning, transactional outbox, provider adapter, safe failure mapping, audit.

## Case-level reviewer assignment

- Classification: `TRUE_GREENFIELD`.
- Partial adjacent evidence: assigned lawyer, collaborators, DocumentReview reviewer, TaskReviewDecision reviewer.
- Why not recovery: no durable Case reviewer role or lifecycle exists. Object-level review must not be overloaded.
- Required foundation: exact reviewer eligibility, one/many policy, assignment history, conflict-of-interest boundary, notifications, Case Workspace UI, authorization tests.

## Billing

- Classification: `TRUE_GREENFIELD`, deferred.
- Partial historical evidence: `cb29052` and `52f8fab` aggregate minutes and classify time attribution. They do not implement rates, money, invoices, tax, write-offs, accounting export, or customer billing DTOs.
- Why not recovery: the historical branches are recorded-work read models, not billing.
- Required foundation later: frozen commercial policy, rate provenance, currency/tax rules, invoice lifecycle, corrections, accounting integration, internal/customer DTO separation, legal retention.

## Not greenfield

- Search, Handoff, Legal Analysis backend, Clause APIs, Work Package, document comparison, portal membership, organization compliance, and time reporting are not greenfield.
- Internal-intake portal publication is a new policy edge over existing primitives, not a new portal.
- Typed-deadline agenda and Task-Time are reconnects over existing persistence.

```text
TRUE_GREENFIELD_COUNT=4
```
