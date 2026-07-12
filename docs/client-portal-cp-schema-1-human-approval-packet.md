# Client Portal CP-SCHEMA-1 Human Approval Packet

## Purpose

This is a **documentation-only** human approval packet for CP-SCHEMA-1. It makes:

- human approval packet only;
- no schema change;
- no migration;
- no DB connection;
- no migration command;
- no production apply;
- **no CP-SCHEMA-1 authorization yet**;
- no Client Portal enablement;
- no runtime/API/frontend change;
- no external visibility authorization.

It consolidates the frozen planning decisions into a single reviewer-ready packet
so a human can approve, reject, or request changes. **It does not grant approval
by itself.**

## Executive summary

- **CP-SCHEMA-1 is well planned but still blocked.**
- **Human approval is required** before any `schema.prisma` draft can be applied.
- **Production apply remains NO-GO.**
- **Client Portal remains inert** (mock frontend + `401`/`501` disabled backend
  shell with fail-closed authz/service stubs and unwired DTO/mappers).

Companion documents:

- `docs/client-portal-cp-schema-1-prisma-draft-nonapplied.md` — non-applied draft;
- `docs/client-portal-cp-schema-1-risk-register.md` — risk register;
- `docs/client-portal-cp-schema-1-next-gates.md` — gate plan;
- `docs/client-portal-cp-schema-1-readiness-checkpoint-2.md` — readiness state.

## What CP-SCHEMA-1 would cover

Final candidate model names (V1 scope):

- `ClientPortalUser`
- `ClientPortalMatterGrant`
- `ClientPortalMatterPublication`
- `ClientPortalDocumentShare`
- `ClientPortalUploadRequest`
- `ClientPortalUploadedFile`
- `ClientPortalTask`
- `ClientPortalAuditEvent`

Deferred (not V1):

- `ClientPortalMessageThread`
- `ClientPortalMessage`
- `ClientPortalNotificationPreference`

Note for the approver: `schema.prisma` already contains an **inert legacy candidate
block** (`ClientPortalUser`, `ClientPortalMembership`, `ClientVisibleArtifact`,
`ClientPortalGrant`, `ClientSubmission`, `ClientSubmissionAttachment`,
`ClientPortalAuditEvent` and their enums). Two final names (`ClientPortalUser`,
`ClientPortalAuditEvent`) **collide with that block**, so implementation must
explicitly decide replace-vs-migrate-vs-rename for the legacy candidates. This is
called out in the non-applied draft and the risk register.

## Frozen planning decisions

- explicit **`ClientPortal*`** naming (ambiguous `ClientPortalMembership` /
  `ClientVisibleArtifact` retired as stale candidates);
- external-safe **`*Ref`** strategy (opaque, non-sequential, prefixed, unique,
  indexed; never internal DB IDs; never identity-encoding);
- **model-specific status enums** (no shared status enum);
- explicit **grant / share / publication / upload-request** semantics;
- **an internal FK is not visibility**;
- **a matter grant is not a document share**;
- **content-free audit**;
- **no `documents.workspaceText`**;
- **no raw document content**;
- **no internal DTO reuse**.

## Human approval questions

| # | Question | Decision (approve / reject / needs changes) | Notes |
| --- | --- | --- | --- |
| 1 | Approve final model names? | ☐ pending | includes legacy-block collision handling |
| 2 | Approve V1 model scope (8 models)? | ☐ pending | |
| 3 | Approve deferred message/notification scope? | ☐ pending | |
| 4 | Approve external-safe ref strategy (prefixed opaque refs)? | ☐ pending | generator design still open |
| 5 | Approve enum values? | ☐ pending | see enum/ref decision + drift note |
| 6 | Approve field set? | ☐ pending | see field spec draft |
| 7 | Approve relation/index/cascade principles? | ☐ pending | see relation/index spec |
| 8 | Approve revocation/expiry semantics (revoke over delete; immediate)? | ☐ pending | |
| 9 | Approve retention/legal-hold placeholders (`retentionPolicyKey`)? | ☐ pending | policy vocabulary open |
| 10 | Approve the no-raw-text / no-`workspaceText` rule as absolute? | ☐ pending | |
| 11 | Approve the clone rehearsal requirement before any real migration? | ☐ pending | |
| 12 | Approve that production apply remains a separate decision even after schema approval? | ☐ pending | |

## GO / NO-GO / BLOCKED matrix

| Area | Current status | Reason | Next action |
| --- | --- | --- | --- |
| Frontend mock | READY-INERT | static/SSG, synthetic-only, API-free, demo-ready | none required |
| Inert backend route matrix | READY-INERT | auth-first, `401`/`501`, no service/mapper/Prisma | none required |
| Authz stubs | READY-INERT | fail-closed, unwired, no Prisma | none required |
| Service stubs | READY-INERT | fail-closed, unwired, no Prisma | none required |
| DTO/mappers | READY-INERT | allow-list, unwired, tested | none required |
| Model names | PLANNED-FROZEN | naming decision `523ca1d` | human approval (Q1) |
| Fields | DRAFTED | field spec `c7599cb` | human approval (Q6) |
| Enums/refs | DRAFTED | enum/ref decision `9ef6231` | human approval (Q4, Q5) |
| Relations/indexes | DRAFTED | relation/index spec `78c549d` | human approval (Q7) |
| Prisma schema implementation | **BLOCKED** | no human approval; legacy-block collision unresolved | Gate 1 → Gate 3 |
| Migration | **BLOCKED** | no approved schema patch; no clone rehearsal | Gate 4+ |
| Clone rehearsal | NOT STARTED | requires generated migration | Gate 6 |
| Production apply | **NO-GO** | standing production-apply NO-GO posture | Gate 9 (separate decision) |
| Client Portal enablement | **BLOCKED** | triple gate off; no live authz/services/schema | post-schema, post-authz review |
| External visibility | **BLOCKED** | no external visibility review | Gate 10 |

## Approval outcome

- **Until this packet is explicitly approved, no schema implementation may begin.**
- **Even after approval, production apply remains a separate NO-GO gate** requiring
  its own decision, clone rehearsal proof, and rollback acceptance.

## Non-authorizations

- no `schema.prisma` edit;
- no migration;
- no DB query;
- no migration command;
- no production apply;
- no runtime API;
- no frontend API integration;
- no external visibility;
- no Client Portal enablement.

## Final statement

**This packet requests future human approval only. It does not grant approval by
itself.** CP-SCHEMA-1 remains blocked; production apply remains NO-GO; Client
Portal remains inert.
