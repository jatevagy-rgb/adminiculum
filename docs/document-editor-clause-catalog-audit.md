# Document Editor Clause Catalog Audit

## Existing Sources

- `Frontend/src/lib/editor/insertionPresets.ts`: local structured insertion presets for party blocks, recitals, definitions, clauses, annex references, signatures, and tables.
- `Backend/src/modules/clause-library`: persistence-backed clause CRUD, lawyer profiles, recommendations, and assembly drafts.
- `/clause-library`: existing UI surface for the broader clause library.

## Decision

No runtime clause catalog was wired into the professional editor in this package.

## Reason

The backend clause library is feature-gated by `ENABLE_CLAUSE_LIBRARY`, contains persistence and recommendation behavior, and is broader than a safe editor insertion catalog. It must not be used as an automatic legal recommendation engine without a separate governance, permission, approval, and content lifecycle review.

## V1 Disposition

- Local insertion presets remain available as structured editor helpers.
- No hardcoded substantive legal advice catalog was added.
- No automatic clause selection was added.
- No AI clause recommendation was added.
- Dynamic clause-library integration is deferred.
