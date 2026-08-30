# Do-not-rebuild register

This register blocks greenfield duplication. `ACTION` can still require reconnection, hardening, or acceptance.

| Capability | Current state | Entry point | Missing connection | Action |
|---|---|---|---|---|
| Immutable DocumentVersion | Canonical, connected | Case Documents and document version routes | None material | KEEP_AS_IS |
| Anchored annotations | Canonical, connected to review | Annotation routes/service and review workspace | Broader UX refinement only | KEEP_AS_IS |
| Document review lifecycle | Canonical persistence and routes | `/reviews`, case review workspace | Queue polish/live acceptance | RECONNECT_CURRENT where needed |
| Shared DOCX/PDF extraction | PR94 merge-ready recovery | `textExtractor.ts` | Canonical merge and live storage proof | MERGE_CURRENT_RECOVERY |
| Structured comparison | Canonical persistence/UI plus PR94 formats | `/documents/compare` | PR94 extraction | MERGE_CURRENT_RECOVERY |
| Anonymize/rehydrate | Canonical, SEC-0B1 hardened | Document modal flow and anonymize routes | Live/provider acceptance only | KEEP_AS_IS |
| Portal membership/onboarding | Canonical, security-sensitive | identity/onboarding/admin routes | PR92 multi-workspace resolution | MERGE_CURRENT_RECOVERY |
| Organization compliance | Canonical Phase 6/7 chain | company/org compliance surfaces | case/work-package connection | RECONNECT_CURRENT |
| Work Package templates/snapshot/runtime | Template and snapshot canonical; runtime active | case service, work-package admin, PR96/98/100 | merge stack | MERGE_CURRENT_RECOVERY |
| Outlook Graph inbound | Canonical adapter plus PR95 | communications status/sync/import | PR95 DTO P1 and live config | SECURITY_REWRITE_AND_REPLAY |
| Global search | Canonical and reachable | TopBar -> `/search` -> `/documents/search` | Classification UX may be refined | KEEP_AS_IS |
| Handoff package | Canonical and multi-surface | case/document/compare/communications entry points | Environment foundation/live proof | KEEP_AS_IS |
| Timesheet/reporting | Canonical | `/time-entries`, workload, report modules | task attribution | RECONNECT_CURRENT |
| Task submission/review/decision | Canonical, PostgreSQL covered | `/tasks`, review routes | case-level reviewer is separate | KEEP_AS_IS |
| Clause APIs and page | Canonical, partially contextual | `/clause-library`, generation workspace | case/document insertion contract | RECONNECT_CURRENT |
| Legal Analysis | Secure backend/API/component current | legal-analysis routes and unmounted panel | Document Workspace consumer | SURFACE_EXISTING |
| Client publication/explanation | Canonical safe projection | publication service and portal pages | internal-intake grant policy | RECONNECT_CURRENT |

## Anti-rebuild rules

1. A missing menu item does not authorize a new backend.
2. A backend-only module is first evaluated for a current UI consumer and security suitability.
3. An active PR is neither canonical nor absent; it is a merge-train dependency.
4. A historical screen supplies information hierarchy and interaction semantics only.
5. Existing schema is reused unless a focused proof demonstrates it cannot represent the required durable state.
6. Live-unproven infrastructure is accepted only after external configuration and runtime evidence, never from CI alone.

`DO_NOT_REBUILD_COUNT=17`.
