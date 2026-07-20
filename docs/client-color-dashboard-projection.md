# Client Color Dashboard Projection

- Task and review rows use the existing `Task.case.clientColorKey` projection.
- Deadline rows resolve `caseId` only against the case list already loaded for the authenticated dashboard.
- Communication rows use `Communication.clientColorKey` from the list DTO.
- Resume/focus rows show a small decorative marker when their task/case relation carries a color.
- Quick actions, status, urgency, calendar state, and KPI semantics remain unchanged.
- No row-level client request or name-based inference exists.
