# Operational UX Release Known Risks

## Summary

No release-introduced blocking risk was found. The following inherited risks remain visible for human approval and follow-up.

| Risk | Origin | Blocking | Owner / action |
| --- | --- | --- | --- |
| Document text route is authenticated but lacks document-scope authorization | inherited | non-blocking for runtime-equivalent release; security approval required | Security/backend: create a dedicated document-scope authorization hardening ticket before expanding access |
| Document text may return `workspaceText` for an existing modified working copy | inherited | tied to the authorization risk above | Security/backend: include this response path in the authorization and content-boundary review |
| Professional editor content hydration can be blank for an existing document | inherited | non-blocking | Editor team: investigate document-content hydration separately |
| `/cases` visibility and case-scoped agenda access can differ for some local records | inherited | non-blocking | Authorization/workflow: reconcile case access semantics and add targeted tests |
| Dependency audit findings remain | inherited | non-blocking for this narrow unchanged-package release | Dependency owner: frontend 4 moderate; backend 2 low, 9 moderate, 7 high, 1 critical |
| Frontend Oryx build requires explicit production public env | inherited operational control | blocking if env proof is absent at deploy time | Release operator: verify production env and run `verify:prod-env`/bundle smoke |

## Document Text Authorization Ticket Recommendation

Create a separate security-hardening ticket covering:

- case/document membership or responsible-lawyer access resolution;
- wrong-case and wrong-document denial tests;
- modified working-copy `workspaceText` response authorization;
- SharePoint-backed extraction authorization;
- audit-safe failure responses;
- no raw content in logs;
- compatibility with editor, review, and litigation callers.

Do not fix this incidentally in the release integration branch because the runtime must remain identical to approved commit `01949dc`.

## Release-Introduced Risk Assessment

- New authorization boundary: none.
- New persistence behavior: none.
- New schema or migration dependency: none.
- New package/dependency change: none.
- New AI/n8n, Client Portal, Outlook/Graph, or feature enablement: none.
- New production configuration requirement: none beyond the existing explicit frontend public env control.

## Approval Posture

The release may proceed to a separate human production-deployment approval if the inherited document authorization risk and dependency posture are explicitly accepted for this runtime-equivalent release.

This document does not authorize deployment.
