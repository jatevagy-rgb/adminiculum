# Client Portal CP-SCHEMA-1 Schema Patch Review Checklist

## Purpose

This is a **documentation-only** checklist for reviewing a **future** CP-SCHEMA-1
schema patch. It exists so that when (and only when) a patch is authorized, the
review is mechanical and complete. **This checklist does not authorize a schema
patch or a migration.**

## Pre-review blockers

All must be true before a patch review can even begin:

- [ ] human approval packet accepted (`docs/client-portal-cp-schema-1-human-approval-packet.md`, 12 questions);
- [ ] collision strategy accepted (`docs/client-portal-cp-schema-1-collision-resolution-and-patch-strategy.md`), including the legacy-table production-emptiness verification;
- [ ] final names accepted (model naming decision);
- [ ] field spec accepted;
- [ ] enum/ref decision accepted (incl. `ClientPortalAuditOutcome`→`Result` rename call and `INVITED` question);
- [ ] relation/index spec accepted (incl. partial-index strategy for active grants);
- [ ] retention / legal-hold policy accepted;
- [ ] external auth provider decision accepted;
- [ ] acknowledged: **production apply is still a separate decision** even after all of the above.

## Patch file review

- [ ] no `workspaceText`;
- [ ] no raw document content;
- [ ] no AI prompt/output fields;
- [ ] no unconstrained JSON payloads (no `payload Json` / `metadata Json?` reintroduced);
- [ ] no internal visibility shortcuts (no access derived from `Client`/`Case`/collaborator relations);
- [ ] explicit grants/shares present (`ClientPortalMatterGrant`, `ClientPortalDocumentShare`) and required by design;
- [ ] no ambiguous legacy models remain (`ClientVisibleArtifact`, `ClientPortalMembership`, `ClientPortalGrant`, `ClientSubmission*` handled per approved strategy);
- [ ] no broad cascade deletes (each `onDelete` explicit and reviewed; no `Cascade` into portal history/audit; legacy `user→membership` and `artifact→grant` cascades not reproduced);
- [ ] no accidental table-name collisions (`client_portal_users`, `client_portal_audit_events` disposition matches the approved strategy; new `@@map` names unique);
- [ ] no enum reuse mismatch (`ClientPortalUserStatus` value set final; `ClientPortalAuditAction` values match the approved taxonomy; `ClientPortalGrantStatus` reuse conscious, not accidental);
- [ ] indexes match the concrete query plan (no speculative indexes; partial active-grant uniqueness handled via approved mechanism);
- [ ] relation names match actual `schema.prisma` conventions (back-relations added on `Case`/`Client`/`Document`/`User` verified against the real file).

## Migration review

- [ ] generated **locally only**;
- [ ] manually inspected line by line;
- [ ] no destructive operations without explicit approval (drops of legacy tables only per the approved strategy and only after emptiness verification);
- [ ] enum operations understood (value adds vs removals; `ClientPortalAuditAction` replacement plan);
- [ ] indexes acceptable (count, size, uniqueness semantics with nullable columns);
- [ ] rollback / forward-fix documented;
- [ ] empty-DB rehearsal passed;
- [ ] clone rehearsal passed.

## Runtime review before enablement

- [ ] routes still disabled (`401`/`501 CLIENT_PORTAL_NOT_ENABLED`; triple gate intact);
- [ ] authz implemented and tested (grant-scoped, fail-closed paths preserved, non-enumeration policy applied);
- [ ] services grant-scoped (authorization-before-service order; explicit selects; no raw rows);
- [ ] mapper allow-list tests pass (forbidden fields still dropped);
- [ ] frontend still not wired until approved (no `fetch`/`@/lib/api` in portal tree);
- [ ] no external visibility until the separate Gate 10 decision.

## Final checklist conclusion

**This checklist does not authorize a schema patch or a migration.** CP-SCHEMA-1
remains blocked; production apply remains NO-GO; Client Portal remains inert.
