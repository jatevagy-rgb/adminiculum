# Workflow Core — Litigation Legal Safety Rules

`WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1`

This package organizes attorney work. It does **not** make legal judgements and
does **not** represent inferred legal truth. The following rules are binding and
are enforced by DTO mappers, backend-derived capabilities, and static-safety
guards (`tests/litigationCaseLifecycleStaticGuards.test.ts`).

## Truth boundaries

- **Issue status is workflow state, not legal truth.** (No issue model exists in
  V1; when added, its status remains workflow metadata.)
- **Evidence relation is human-classified metadata, not proof of fact.** In V1 no
  relation model exists, so evidence relation is always `UNCLASSIFIED`; it is
  never auto-classified from document text.
- **Pleading approval is internal approval, not proof of filing.** Filing status
  is only shown if explicitly persisted — which it is not in V1
  (`canMarkFiled = false`).
- **Filing state is only surfaced when explicitly persisted.** No filing status
  column exists, so filing state is never asserted.
- **Closure readiness is operational, not legal advice.** Wording used:
  “*Az ügy operatív lezárásának feltételei még nem teljesülnek.*” The system
  never says “*Az ügy jogilag lezárható*” or “*Minden jogi kötelezettség
  teljesült*”.

## Prohibited computations

- No outcome prediction, win/success likelihood, or merits scoring.
- No automatic burden-of-proof determination (`availability.burdenOfProof = false`).
- No inference of claims, issues, evidence significance, or procedural posture
  from free text.
- No AI analysis of any kind (see `docs/architecture-ai-n8n-boundary.md`).
- No automatic case status change, closure, reopening, or pleading-filing from a
  document/task event.

## Privacy guarantees

Explicit DTO mappers prevent exposure of: `workspaceText`, raw/extracted/OCR
document text, communication body/content, raw evidence substance, private legal
analysis, AI prompts/outputs, storage/SharePoint paths, broad audit payloads,
arbitrary JSON, Client Portal fields, and external-publication fields.

## Human judgement remains required

Every legal determination — whether an allegation is true, whether evidence is
sufficient, the burden of proof, legal merit, and whether a matter may be closed
*as a legal matter* — remains the responsibility of the attorney. The system
provides organization and operational readiness signals only.
