# GWU-3 — Controlled State, Provenance, Freshness and Conflict Gap Audit

**Audit base:** `3832b584a34fc7da9eef25dffa623e0ff2ceab45` (`origin/master`)

This is an implementation contract and gap audit only. It does not implement a
new architecture, add runtime code, change the Prisma schema, add a migration,
or change production data. `ROADMAP_CAPABILITIES_REMOVED=NONE`.

## Boundary and canonical doctrine

GWU-3 covers controlled editing, provenance, freshness, and conflict handling.
Customer publication, broad customer editing, persisted recommendation
feedback, and other capabilities outside that boundary remain deferred.

The canonical doctrine is preserved:

- `ClientFact` is accepted company state. `ClientFactAnswerState` points to the
  current answer for a definition/scope and can be `ANSWERED` or `UNKNOWN`.
- `Observation` records an external or declared observation run. Its
  `rawPayload`, `observedAt`, source connection and digest do not update a
  `ClientFact`.
- `ProcessObservationSnapshot` records a deterministic measurement of a
  `BusinessProcess`; it is not a company fact and the snapshot service never
  writes `ClientFact`.
- Document versions, evidence records, and extracted/proposed material remain
  sources or evidence until an explicit canonical acceptance path exists.
- A verified or accepted workforce record is not automatically customer-visible.

## Canonical inventory

| Family | Existing canonical model/fields | Existing behavior | GWU-3 implication |
|---|---|---|---|
| ClientFact | `clientId`, legacy `type/value`, `factDefinitionId`, `factSubjectId`, `scopeType`, typed value columns, `validFrom`, `validTo`, `observedAt`, `effectiveAt`, reference period, `determinationMethod`, `supersededAt`, `sourceReference`, `sourceDocumentVersionId`, `verificationStatus`, `verifiedById`, `verifiedAt` | Typed creation validates the FactDefinition, scope, value, temporal fields and optional same-client document source. `DISALLOW` overlap rejects an overlapping active fact. | Primary accepted-state record. Meaning/provenance fields of typed facts are immutable on the generic update path; a new fact is created instead. |
| ClientFactAnswerState | `clientId`, `factDefinitionId`, `scopeType`, `factSubjectId`, `currentFactId`, `status` | Company Profile answers update/create the state and point it to the newly created typed fact; `UNKNOWN` clears `currentFactId`. | Provides current-answer selection, not a provenance or conflict history. |
| FactDefinition | unique `key`, domain/value type, allowed scopes, `determinationMethod`, `overlapPolicy`, `temporalPolicy`, status | Registry/configuration for typed facts and temporal interpretation. | Existing policy source; not a client-specific evidence record. |
| FactSubject | client/scope/subject key, optional person/contract links, start/end/archive fields | Scopes employee, contract and other subject facts without changing the canonical fact model. | Conflict and editing must retain subject scope. |
| DocumentVersion | version lineage, `isCurrent`, review/publication status, upload source, storage reference | Canonical document/version workflow and source for a ClientFact or EvidenceRecord. | A document can support a fact, but extraction is not an automatic fact mutation path. |
| EvidenceRecord | source type, review status, reviewed metadata, `validFrom/validUntil`, links to document/fact/observation/external reference | Controlled creation/review of evidence; accepted/rejected status requires review metadata. Control evidence derives `CURRENT`/`STALE` from its validity interval. | Reusable evidence and source linkage exist; this is not a canonical fact acceptance decision. |
| ExternalSourceConnection | client-scoped source type/name/status/config, discovery runs | Read-only source-health projection and observation creation/listing. `config` is not exposed by the source-health DTO. | Source connectivity and observation provenance exist; no automatic external-to-fact acceptance exists. |
| Observation | client/source/run, idempotency key, input digest, type, raw payload, `observedAt`, evidence links | Append-only, idempotent observation record tied to a source/run. | Observation remains observed input, never canonical state. |
| ProcessObservationSnapshot | process, metric version, observed time, input/snapshot digests, metrics, provenance JSON | Deterministic capture/upsert and chronological history. | Measured process state is separately projected and must not overwrite ClientFact. |
| Company OS Data Room | read-only DTO over profile, facts, organization, processes, systems, docs, compliance, evidence, initiatives and outcomes | Workforce-only `GET /api/v1/company-workspace/clients/:clientId/data-room`; current DTO explicitly returns `staleAvailable: false` and `conflictingAvailable: false`. | Read model is not an editing or conflict-resolution surface. |

## 1. Editing audit

### Existing canonical write paths

1. **Company Profile 2.0 answer path.** The customer organization route
   `PUT /api/v1/client-portal/org/company-profile/questions/:questionKey` and
   screen route validate an active organization workspace membership. Only
   `REPRESENTATIVE` and `APPROVER` membership roles can write. The service
   resolves the active `FactDefinition`, supersedes active same-definition
   company facts, creates a typed `ClientFact` with `CLIENT_PROVIDED` and a
   portal identity `sourceReference`, then updates or creates
   `ClientFactAnswerState` and synchronously re-evaluates dependent compliance.
   `UNKNOWN` clears the current fact after reevaluation.
2. **Workforce fact path.** `POST /api/v1/client-company/clients/:clientId/facts`
   creates either a typed fact through `createTypedFactAndEvaluate` or a legacy
   company fact. `PATCH /api/v1/client-company/facts/:factId` can edit legacy
   values and validity/source fields, but rejects meaning/provenance changes on
   typed facts with `TYPED_FACT_IMMUTABLE`; material legacy value/source changes
   reset verification. `POST /facts/:factId/verify` is manager-only and records
   `DOCUMENT_VERIFIED` or `LAW_FIRM_VERIFIED` with reviewer identity/time.
3. **Operating profile.** The workforce route upserts `ClientOperatingProfile`
   and preserves `lastReviewedAt`/`nextReviewAt`; compliance enrollment changes
   require an `ADMIN`/`PARTNER` manager.
4. **Organization records.** The client-organization routes create/update groups
   and persons, transition employment status, add/remove responsibilities and
   link person documents. Writes require the client-manager authorization guard
   and same-client relation checks.
5. **Process and system records.** The client-company routes create/update/delete
   `BusinessProcess`, `BusinessProcessStep`, and `BusinessSystem` records with
   client ownership checks. Process observations are captured separately after
   these edits.
6. **Assessments, findings, initiatives and controls.** Existing transitions and
   review endpoints are state-machine or review paths. Completed/archived
   assessments are locked; recommendation acceptance is human-gated and does
   not silently become canonical company state.
7. **Evidence and document links.** Evidence records can be created/reviewed and
   linked to controls, with same-client source checks. Reusing a published
   document for a control does not mutate a ClientFact.

### What the Company OS can and cannot edit

The Company OS Data Room itself is read-only. Its current editable canonical
families are reachable through the existing workforce routes above: operating
profile, facts, organization groups/persons, processes/systems, controls,
assessments, findings and initiatives. The customer-safe Company Profile route
can edit only its registered answerable facts and responsibilities under the
organization membership policy.

There is no canonical write path for a Company OS DTO field as an undifferentiated
"edit everything" operation. In particular, there is no existing canonical
write path for accepting an Observation, ProcessObservationSnapshot,
ResearchEvidence row, or document extraction proposal as a ClientFact. No
document-extraction-to-fact proposal workflow was found in the inspected
Company Profile/Company OS modules; document versions are source artifacts and
evidence records are reviewed evidence.

## 2. Provenance audit

### Existing representations

| Requested origin | Existing representation | Coverage |
|---|---|---|
| `USER_DECLARED` | Company Profile answer creates `verificationStatus=CLIENT_PROVIDED`, `determinationMethod=USER_PROVIDED`, and a bounded `sourceReference` containing the portal identity. Legacy facts can carry `sourceReference` but have no typed origin enum. | PARTIAL |
| `LAW_FIRM_VERIFIED` | `ClientFactVerificationStatus.LAW_FIRM_VERIFIED`, `verifiedById`, `verifiedAt`; manager-only verification transition. | COMPLETE for this specific verification state |
| `DOCUMENT_EXTRACTED` | `sourceDocumentVersionId` links a fact to a document version; `DOCUMENT_VERIFIED` is available only when a source document exists. No field says that a machine/document extraction proposed the value, and no extraction acceptance record exists. | PARTIAL |
| `SYSTEM_OBSERVED` | `Observation` and `ExternalSourceConnection` carry source/run, digest and observed time; process snapshots carry provenance JSON. There is no direct canonical `ClientFact` origin/link from an observation. | PARTIAL |
| `AUTHORITY_VERIFIED` | No generic authority verification enum exists. `LAW_FIRM_VERIFIED` is narrower and must not be relabelled as authority verification. | MISSING |
| `DERIVED` | `FactDeterminationMethod.DERIVED` exists on FactDefinition/ClientFact and diagnostic DTOs label derived diagnosis separately. Input lineage and acceptance metadata for a derived fact are not persisted. | PARTIAL |

The existing enums are `ClientFactVerificationStatus` (`UNVERIFIED`,
`CLIENT_PROVIDED`, `DOCUMENT_VERIFIED`, `LAW_FIRM_VERIFIED`) and
`FactDeterminationMethod` (`USER_PROVIDED`, `DERIVED`,
`LEGAL_CLASSIFICATION_REQUIRED`, `TECHNICAL_CLASSIFICATION_REQUIRED`). No new
provenance enum is introduced by this audit. `EvidenceRecord` and
`ResearchEvidence` have their own source/verification semantics and must not be
collapsed into the ClientFact origin taxonomy.

### Provenance gaps

- A fact can point to one document source, but the system does not retain a
  durable extraction proposal, extractor identity/version, or explicit human
  acceptance event.
- An Observation or measured snapshot can be displayed with provenance, but no
  canonical fact lineage links it to an accepted ClientFact.
- Generic authority verification is not represented; law-firm verification is a
  distinct, narrower state.
- Derived determination is represented, but the input fact IDs, rule/version and
  acceptance decision are not part of ClientFact persistence.

For the initial provenance-display slice, existing fields can be projected
truthfully and missing origins must remain explicit. Full six-origin lineage is a
real persistence gap, not a frontend label problem.

## 3. Freshness audit

### Existing temporal semantics

- `FactDefinition.temporalPolicy` is one of `VALIDITY_INTERVAL`, `OBSERVATION`,
  `EFFECTIVE_INSTANT`, `REFERENCE_PERIOD`, or `EVENT`.
- `ClientFact.validFrom`/`validTo` express a validity interval. Typed mutation
  validates required `observedAt`, `effectiveAt`, or reference-period fields for
  the configured policy and rejects invalid intervals.
- `observedAt` says when an observation was made; it does not by itself say that
  the fact is stale. `effectiveAt` says when a business effect applies. Neither
  field contains a review cadence.
- `supersededAt` identifies a fact superseded by a later accepted fact; it is not
  an age-based stale flag.
- `EvidenceRecord.validFrom`/`validUntil` support a real current/expired check.
  `ControlDefinition.defaultReviewCadenceDays` and `ClientControl.nextReviewAt`
  support control review timing. `ClientOperatingProfile` has explicit review
  timestamps.
- `DocumentVersion.reviewStatus` and publication state express workflow state,
  not a universal fact freshness policy.
- `ProcessObservationSnapshot.observedAt` orders measurements; the snapshot
  service does not define an arbitrary freshness horizon.

### Minimum truthful freshness model

1. Derive validity only where the canonical model supplies an explicit boundary:
   a fact/evidence record with `validFrom` not after evaluation time and a
   non-expired `validTo`/`validUntil` is currently within its declared interval;
   an expired end boundary is truthfully expired.
2. Use the FactDefinition temporal policy to decide which time fields are
   required and eligible. Do not call an observation old merely because it is
   older than a fixed number of days.
3. Report `observedAt` and `effectiveAt` as timestamps, and report review due
   only for the existing profile/control review fields. Do not infer an authority
   expiry that is not stored.
4. Keep the Company OS `staleAvailable=false` contract until a product-approved
   policy exists for categories without explicit validity/review boundaries.

No universal persisted stale bit is currently needed for this truthful model.
Derivation is sufficient for explicit validity intervals and existing review
deadlines. A new review interval/authority-expiry field would be required only
if the product later promises those concepts; inventing a 90-day rule would be
incorrect.

## 4. Conflict audit

### What is and is not a conflict

Multiple historical facts are not automatically a conflict. A real conflict is a
simultaneously eligible, same-definition/scope set whose accepted meanings
disagree, or a disagreement that requires review between a client-declared value
and an authority/document/system source. A superseded fact is history, not a
conflict.

### Existing behavior

- `FactOverlapPolicy.DISALLOW` rejects overlapping active typed facts for the
  same client, definition, scope and subject. Company Profile answer writes
  explicitly supersede the active same-definition company facts before creating
  the new answer.
- `supersededAt` and `ClientFactAnswerState.currentFactId` preserve current-vs-
  historical selection, but do not record why a value was superseded.
- `EvidenceVerificationStatus.DISPUTED` and Grow recommendation sufficiency
  `CONFLICTING_EVIDENCE` identify conflicting evidence/recommendation support.
  They do not represent a canonical ClientFact disagreement.
- The Company OS DTO deliberately reports `conflictingAvailable=false`; the
  diagnostic workbench can report conflicting evidence, which is a separate
  derived diagnosis signal.
- No service silently overwrites a typed fact with an Observation or measured
  snapshot. Generic typed fact updates reject meaning/provenance edits.

### Required separation

- **CONFLICT_DETECTION:** derive eligible same-definition/scope candidates and
  compare their typed values and source/verification state; distinguish overlap,
  stale history, disputed evidence, and true disagreement.
- **CONFLICT_REVIEW:** present the competing canonical/source records to an
  authorized workforce reviewer; no customer or frontend heuristic decides.
- **CONFLICT_RESOLUTION:** record the reviewer decision and the disposition of
  each competing record (accepted, superseded, rejected, or still open).
- **CANONICAL_ACCEPTANCE:** only an explicit authorized acceptance may create or
  promote a canonical ClientFact; Observation, snapshot, document extraction,
  and external verified input remain non-canonical until then.

The first concept can be derived from current rows. Review and durable
resolution cannot: current persistence has no conflict case, reviewer decision,
resolution reason, or accepted-fact reference.

## 5. Smallest safe GWU-3 slices

These slices are implementation gates, not work performed by this PR.

### GWU-3A — controlled edits of accepted canonical facts

- **GOAL:** make the existing typed/legacy fact and profile write paths explicit,
  reviewable and audit-safe without a generic edit endpoint.
- **CURRENT_CANONICAL_MODEL:** `ClientFact`, `ClientFactAnswerState`,
  `FactDefinition`, `ClientOperatingProfile` and existing organization/
  process/system models.
- **NEW_PERSISTENCE_REQUIRED:** NO for the first slice. Append-only typed fact
  creation, `supersededAt`, current answer state, and existing verification
  fields are sufficient.
- **BACKEND:** reuse existing manager and active organization-membership guards;
  expose only family-specific commands and preserve synchronous reevaluation.
- **FRONTEND:** show the correct family editor and current/history distinction;
  never edit a typed fact's meaning in place.
- **SECURITY:** workforce managers remain on `/client-company`; customer writes
  remain organization workspace Company Profile routes; no portal elevation.
- **REGRESSION_RISK:** accidental overwrite, cross-client source linkage,
  compliance re-evaluation drift, or customer access to workforce routes.
- **PG_TEST:** manager create/answer, typed immutability, supersession/current
  AnswerState, UNKNOWN clearing, cross-client source rejection, and role denial.

### GWU-3B — provenance display and source linkage

- **GOAL:** display existing provenance fields and source links with explicit
  unknown/unavailable states.
- **CURRENT_CANONICAL_MODEL:** ClientFact verification/source fields,
  DocumentVersion, EvidenceRecord, Observation, ProcessObservationSnapshot,
  ResearchEvidence and diagnostic provenance classes.
- **NEW_PERSISTENCE_REQUIRED:** NO for display of existing provenance; YES
  later if full six-origin lineage, extraction proposal identity, or derived
  input lineage must be durable.
- **BACKEND:** extend read projections only from existing relations; do not
  label `LAW_FIRM_VERIFIED` as generic authority verification.
- **FRONTEND:** display source, verification and provenance class without making
  observations look like accepted facts.
- **SECURITY:** keep case/document authorization and field-safe projections;
  never expose raw observation payloads or internal research details to the
  customer portal.
- **REGRESSION_RISK:** provenance overclaim, document leakage, or accidental
  customer-visible workforce evidence.
- **PG_TEST:** projection of every existing source type; missing-origin
  rendering; no automatic fact mutation from observation/document input.

### GWU-3C — validity and review freshness status

- **GOAL:** provide truthful interval/review status from stored boundaries.
- **CURRENT_CANONICAL_MODEL:** FactDefinition temporal policy, ClientFact
  validFrom/validTo/observedAt/effectiveAt/reference period/supersededAt,
  EvidenceRecord validFrom/validUntil, ClientControl review cadence/deadline,
  ClientOperatingProfile review timestamps, and snapshot observedAt.
- **NEW_PERSISTENCE_REQUIRED:** NO for interval-expired and existing review-due
  derivations. YES only for a future category-specific review cadence or source
  authority expiry promise.
- **BACKEND:** one shared policy helper with category-aware explicit-boundary
  derivation; keep unavailable when no boundary exists.
- **FRONTEND:** show the timestamp/boundary and distinguish expired, current,
  review-due, and unavailable without an arbitrary age threshold.
- **SECURITY:** freshness does not bypass source/document authorization.
- **REGRESSION_RISK:** treating old observations as stale, hiding valid history,
  or changing compliance eligibility semantics.
- **PG_TEST:** boundary-at-now, expired validTo/validUntil, superseded facts,
  observation-only facts, control nextReviewAt, and no inferred 90-day status.

### GWU-3D — conflict detection and authorized review

- **GOAL:** detect true simultaneous disagreement, then separately review and
  resolve it without silently choosing a source.
- **CURRENT_CANONICAL_MODEL:** eligible ClientFact rows and overlap policy;
  EvidenceRecord `DISPUTED`; current AnswerState; existing reviewer identity
  fields.
- **NEW_PERSISTENCE_REQUIRED:** PARTIAL. Detection can initially be derived.
  Durable review/resolution needs the smallest additive conflict record holding
  client/definition/scope/subject, competing fact IDs, detectedAt, review status,
  reviewer/time, resolution note, and accepted fact ID. No replacement fact
  hierarchy is needed.
- **BACKEND:** add a workforce-only detection/read path first; later add an
  explicit review command and canonical acceptance transaction. Never auto-
  overwrite ClientFact from an observation or proposal.
- **FRONTEND:** workforce review queue only; show competing values and sources,
  with explicit accept/keep/supersede decision. No customer conflict controls.
- **SECURITY:** client/case/document authorization and manager/reviewer policy
  must be enforced server-side; customer-safe projections expose only approved
  accepted state.
- **REGRESSION_RISK:** falsely classifying history as conflict, source leakage,
  or changing current answer selection before review.
- **PG_TEST:** two simultaneously eligible disagreeing facts, disputed evidence,
  review denial, explicit acceptance, supersession, AnswerState continuity, and
  observation/snapshot non-mutation.

## 6. Schema decision record

| Proposed persistence | EXACT_GAP | WHY_EXISTING_FIELDS_CANNOT_MODEL_IT | WHY_DERIVATION_IS_INSUFFICIENT | SMALLEST_NEW_PERSISTENCE |
|---|---|---|---|---|
| Full provenance lineage (future GWU-3B extension) | Six requested origins are not a single existing ClientFact field; system-observed, generic authority-verified, document-extracted and derived input lineage are missing or ambiguous. | Verification and determination enums are narrower; sourceDocumentVersionId/sourceReference each carry only limited linkage; Observation and snapshot have no accepted-fact relation. | A read-time label would be unable to preserve extractor/source identity, input lineage, or later acceptance history. | Add one explicit origin value plus a bounded source/lineage reference only after product approval; do not add speculative aliases or merge evidence models. |
| Freshness policy extension (conditional) | No stored category-specific review cadence or authority/source expiry for facts/snapshots. | `observedAt` is observation time, not a review deadline; profile/control review fields apply only to those families. | Without a stored boundary, any universal stale threshold would be invented and untruthful. | Add a category-owned review/expiry field only for a demonstrated product requirement; otherwise persist nothing and expose unavailable. |
| Conflict review record (GWU-3D) | No durable competing-value review, reviewer decision, resolution reason or accepted-fact reference. | `supersededAt`, overlap rejection and AnswerState select state but do not explain or retain a conflict decision; `DISPUTED` belongs to evidence. | A derived query cannot preserve a human review decision after one row is superseded or changed. | One additive `ClientFactConflict` record referencing the client/definition/scope/subject, competing fact IDs, detection/review/resolution metadata and accepted fact ID. This is a future design gate, not this audit's implementation. |

No schema or migration is justified for GWU-3A or the initial GWU-3B/3C
read-only slices. GWU-3D persistence is conditional on approval after the
derived detection contract and review policy are accepted.

## 7. Workforce/customer boundary

Controlled editing first belongs to internal workforce context. The existing
`/client-company` and `/client-organization` routes require workforce
authentication and client-manager roles. The organization portal's write routes
remain limited to registered Company Profile answer/responsibility flows under
active workspace membership and representative/approver authority. The Company
OS Data Room has no write route. Customer-safe projections must never expose
workforce review powers, internal evidence details, or unaccepted provenance.

`CUSTOMER_WRITE_BOUNDARY_PRESERVED=YES`
`OBSERVATION_NOT_CANONICAL_STATE=YES`
`NO_AUTOMATIC_OVERWRITE=YES`

## Audit conclusion

- Existing controlled editing is sufficient for a narrow GWU-3A without schema
  change, provided typed facts remain append/supersede rather than in-place
  meaning edits.
- Existing provenance is useful but partial; the six requested origin concepts
  cannot all be truthfully represented today.
- Existing temporal fields support explicit validity and review boundaries, but
  there is no universal stale concept and no justification for an arbitrary age
  threshold.
- Conflict detection can begin as a derived workforce read, while durable
  conflict review/resolution is a conditional persistence gap.
- Observation, document extraction, external verification and measured snapshots
  must remain non-canonical until explicit acceptance.

`RUNTIME_CHANGED=NO`
`SCHEMA_CHANGED=NO`
`MIGRATION_ADDED=NO`
`ROADMAP_CAPABILITIES_REMOVED=NONE`
`PRODUCTION_TOUCHED=NO`
