# Case Attention Read Model

The attention projection is derived from existing operational rows and is never persisted.

Counted sources:

- open Task rows with their real priority and due date;
- explicit Case and CaseIntakeDeadline due dates;
- active DocumentReview rows and document work due dates;
- case-linked `PROPOSED` ComplianceProposal rows requiring an internal decision.

Signals are ordered by urgency, then real due time, then stable source type and id. Closed tasks do not signal attention, and closed/archived/final Cases return no action.

Excluded sources:

- Communications, because the current model does not prove an unanswered inbound state;
- standalone AssessmentFinding rows, because a finding alone is not a Case action;
- client-portal internals and inferred deadlines or responsibility.

The multi-Case endpoint uses one bounded batch for each source and applies the same projection service as the direct Case endpoint. Authorization is the existing Case read boundary; portal callers do not use these internal routes.
