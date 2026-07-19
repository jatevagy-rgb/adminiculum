# Task Lifecycle Release Artifact Manifest

Date: 2026-07-19
Branch: `release/editor-ops-workflow-1`
Runtime source: `4647c080f7c070713ff9ec1f82e4140e3f622c77`
Migration head: `20260718120000_add_task_submission_workflow`

| Component | Artifact | SHA-256 | Files | File-manifest SHA-256 | Target | Result |
| --- | --- | --- | ---: | --- | --- | --- |
| Backend | `C:\Users\hubay\AppData\Local\Temp\adminiculum-task-lifecycle-prod-4647c08-20260719T162339Z\adminiculum-backend-task-lifecycle-4647c08.zip` | `f60e1492a04064f590529ee6981b80f2ed03a2b51177bb72e7f0026c8ef63f03` | 165 | `f10e07b6a5116e3157cf8fedfff91ec327c901e7fe59ab2a13f5267f92380f9a` | `adminiculumbackend-b1-01` | deployed, active |
| Frontend candidate | `C:\Users\hubay\AppData\Local\Temp\adminiculum-task-lifecycle-prod-4647c08-20260719T162339Z\adminiculum-frontend-task-lifecycle-4647c08.zip` | `987a77f4ef0ad27142ce440d4d06230e57937951e00edbb759b67fa2e733768c` | 121 | `dfa946bc661a6bcb450abc7ade34dd0e82d168db90de12f6b2867fdeffde0a2b` | `adminiculumfrontend-austriaeast-01` | failed before activation |
| Frontend rollback | `C:\Users\hubay\AppData\Local\Temp\adminiculum-sol56-ux-release\adminiculum-frontend-sol56-ux-1033a4d.zip` | `68ec4754616a1b61dfa8aefdb28790605afc7333f2a2d5d3f7cfdb45ee746ae5` | prior proven artifact | prior proven manifest | `adminiculumfrontend-austriaeast-01` | deployed, active |

Both candidate artifacts were built as component-only Oryx source ZIPs. The external manifests identify exact runtime commit `4647c08`. Artifact scans found no cross-component source, root docs, `.git`, `.env`, secrets, SQL in the frontend artifact, local API target, disposable database name, or feature-branch substitution. The backend artifact includes the approved migration as repository runtime content but does not auto-run it.

Known provenance note: the deployed backend source tree retains an older embedded `release-manifest.json` from prior runtime content. Activation is instead proven by the external immutable artifact manifest, artifact hash, Kudu deployment ID, deployed lifecycle source markers, and successful lifecycle route smoke. A later release should refresh the embedded manifest during packaging.
