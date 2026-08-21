# Phase 6 Conceptual Model

## Status legend

- **Existing** means the canonical Adminiculum model is reused.
- **Proposed** means a Phase 6 schema addition is required before implementation.
- **Deferred** means the concept is real but does not need a minimum Phase 6
  persisted model.

```mermaid
flowchart LR
  subgraph ProposedLegal["Proposed: legal and requirement history"]
    LS["LegalSource"] --> LSV["LegalSourceVersion\nimmutable hash, provenance, review"]
    LSV --> LP["LegalProvision\nreference + excerpt hash"]
    R["Requirement"] --> RV["RequirementVersion\napproved immutable policy"]
    RV --> RP["RequirementProvision\nM:N support role"]
    RP --> LP
    RV --> ARV["ApplicabilityRuleVersion\nvalidated deterministic AST"]
  end

  subgraph Facts["Proposed definition + Existing value"]
    FD["FactDefinition\ntype, scope, method, question metadata"] --> CF["ClientFact (existing, extended)\nclient value + provenance + temporal scope"]
  end

  Client["Client (existing)"] --> CF
  Client --> RA["RequirementApplicability (proposed)\nimmutable evaluation snapshot"]
  ARV --> RA
  CF --> RA
  RV --> RA

  subgraph Review["Existing review and remediation"]
    A["Assessment"] --> AI["AssessmentItem"]
    A --> AF["AssessmentFinding\nonly a real gap"]
    AI --> AF
    AF --> T["Task\nremediation"]
  end

  RA --> A
  RA -. "gap only" .-> AF
  D["Document / DocumentVersion (existing)"] --> CF
  D --> AI

  subgraph DeferredDelivery["Deferred delivery catalog"]
    RV --> C["Control (deferred)"]
    RV --> ER["EvidenceRequirement (deferred)"]
    CDT["ComplianceDocumentType (deferred)"] --> TV["Approved TemplateVersion (deferred)"]
    TV --> D
  end
```

## Relationship rules

1. `LegalSource` is the stable instrument identity. `LegalSourceVersion` is an
   immutable captured/reviewed representation, identified by content hash,
   provenance and capture date. `LegalProvision` always belongs to exactly one
   source version.
2. `Requirement` is stable product identity. `RequirementVersion` is the only
   runtime policy input and has explicit M:N `RequirementProvision` citations;
   it may reference more than one provision and a provision may support more
   than one requirement.
3. A `RequirementVersion` owns one or more ordered `ApplicabilityRuleVersion`
   rows. Their JSON AST is constrained to deterministic operations over declared
   fact definitions; it is never executable source code.
4. `FactDefinition` declares meaning, type, question metadata, valid scope and
   determination method. The existing `ClientFact` remains the client-owned
   value/evidence record, extended to reference the definition and to carry
   typed, scoped and temporal data.
5. `RequirementApplicability` is a point-in-time evaluation of one client and
   one requirement version. It retains the selected rule, fact inputs or their
   immutable snapshot, source support, result, reason, unresolved inputs,
   evaluation timestamp and engine version. Re-running later produces a new row
   rather than altering historic conclusions.
6. An `Assessment` can display or review evaluations. `AssessmentItem` can hold
   user-facing evidence/review state. `AssessmentFinding` is created only after
   a compliance gap is identified and should later link to its applicability
   record. Existing `Task` handles remediation.
7. Existing `DocumentVersion` is evidence or rendered customer output. A future
   `ComplianceDocumentType` and approved template-version catalog classifies
   delivery; it does not replace document/version lineage.

## Temporal and scope semantics

Client fact records need distinct fields for observed time, legal/effective
time, validity range and reference period. The fact definition identifies which
ones are mandatory. Scope is a bounded enum with an optional same-client entity
reference, so a site risk review, a transaction invoice and a company-wide
employee count cannot be accidentally evaluated as equivalent.

Evaluation status is deliberately multi-valued. Missing facts, legal or
technical classification, ambiguous source support, not-yet-effective law and
expired policy are reviewable results, not `false`.
