# PR91 master-roadmap 90-row reconciliation

The source register is PR91's `MR-001`…`MR-090` table. Each row was
reconciled to the current release tree or an exact historical/active recovery
reference. This compact index preserves every row ID while avoiding a second
unverifiable copy of the old prose evidence.

Legend:

- `CURRENT` — current canonical implementation evidence;
- `PARTIAL` — current evidence exists but a material connection is missing;
- `RECOVERY` — exact active branch/PR evidence, not canonical;
- `HISTORICAL` — exact historical evidence, not current;
- `BACKEND` — backend/service evidence without usable current UI;
- `NONE` — no exact implementation of the row's stated semantic.

| rows | reconciled state | product families / evidence anchor |
|---|---|---|
| MR-001–MR-011 | CURRENT/PARTIAL | Case cockpit, Case Type, Work Package, Workflow, Tasks, submissions, review, deadlines, lifecycle, intake, and case creation paths; current tree plus PR96/98 |
| MR-012–MR-013 | PARTIAL | case-level reviewer assignment has downstream review semantics but no case creation assignment; portal visibility is grant/publication-path dependent |
| MR-014–MR-030 | CURRENT/PARTIAL/RECOVERY | client dossier/admin, house style, workgroups, onboarding, membership, invitation, identity, workspace/grant, individual/org/relay portal, organization persons/hierarchy/policy, approval, grant auth |
| MR-031–MR-038 | CURRENT/PARTIAL/RECOVERY | communication ledger, Outlook import/status, dry-run, inbox, case/client association, metadata attachments, provider conversation identity |
| MR-039–MR-040 | NONE | persisted communication unread/reply state and outgoing mail are not evidenced as implemented |
| MR-041–MR-044 | CURRENT/PARTIAL/RECOVERY | communication task/deadline extraction and branch-only contextual/client summary projections |
| MR-045–MR-059 | CURRENT/PARTIAL/RECOVERY | document workspace, versions, extraction, structured/metadata comparison, annotations, review, approval/delivery, publication, Word-primary editing, anonymization, rehydration, clause, prompts, generation |
| MR-060–MR-070 | CURRENT/PARTIAL/BACKEND | company profile, facts/answer state, compliance, findings, proposals, initiatives, Grow With Us, contracts, obligations, entitlements, backend-only change reports |
| MR-071–MR-075 | CURRENT/PARTIAL | time entries, timesheet reports, Matter, workload/capacity/workgroups, billing placeholder |
| MR-076–MR-090 | CURRENT/PARTIAL/BACKEND/RECOVERY | dashboard, agenda, notifications, shell/navigation, settings/UI pack, storage, scanning, authorization, deploy workflows, search/classification, news, timeline, legal analysis, handoff, responsibility |

## Exact lifecycle correction

The register's capability state and PR lifecycle state are separate:

- PR92–PR98 are open drafts according to authoritative PR metadata.
- PR98 is stacked on PR96.
- PR95's canonical sync is merge commit `e908d49ebd42c9f0d497e2e76816e32a29e2fc0c`;
  it is not a rebase.
- No active recovery capability is counted as canonical.
- PR91's old canonical `50945ecd…` is an archaeology input, not current
  product truth.

This reconciliation closes the prior “90 rows not checked” gap at the row
mapping level, but does not claim that every row has direct runtime or live
acceptance evidence.
