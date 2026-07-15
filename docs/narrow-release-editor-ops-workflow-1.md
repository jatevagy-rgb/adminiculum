# Narrow Release Editor Ops Workflow 1

Date: 2026-07-15
Branch: `release/editor-ops-workflow-1`
Deployment action: none

## Included product areas

- Case Center.
- Tasks and handoff.
- Documents and communications workflow.
- Deadlines and agenda.
- Responsibility, workload, and time.
- Litigation dossier and lifecycle.
- Intake and matter opening.
- Professional editor Mode C.
- Local DOCX import/export.
- Document-level comments.
- Editor review safety and workbench UX.
- Operational cleanup for `/time-entries`, `/deadlines`, and `/clause-library`.

## Explicit exclusions

- No deployment.
- No DB operation or migration execution.
- No schema or migration delta relative to reconstructed deployed baseline.
- No Client Portal expansion.
- No OpenAPI/CORS change.
- No Azure/deployment config change.
- No live Outlook/Graph connector or feature-flag enablement.
- No AI API/n8n logic.
- No editor server content persistence.
