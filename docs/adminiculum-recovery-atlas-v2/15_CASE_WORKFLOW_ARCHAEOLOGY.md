# Case workflow archaeology

Case capability has at least four meaningful generations: legacy case creation, transactional matter intake (`02e02d8`), modern case cockpit (`ad065f5`/`fb8c9bb`), and Work Package productization (`c8809c1`, PR96, PR98).

Canonical has case authorization, attention, timeline, workspace, task links, deadline fields, and document context. The key historical loss is not case creation itself; it is failure to instantiate the modern work scope consistently from every creation path.

## Recovery rule

All paths (manual, communication-created, portal-converted) must converge on one transaction that validates client, workforce assignee, case type, Work Package snapshot, and initial task/workflow state. Preserve current object authorization and String-ID behavior.
