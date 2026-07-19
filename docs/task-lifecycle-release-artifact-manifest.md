# Task Lifecycle Release Artifact Manifest

Date: 2026-07-19
Branch: `release/editor-ops-workflow-1`
Runtime source: `4647c080f7c070713ff9ec1f82e4140e3f622c77`
Migration head: `20260718120000_add_task_submission_workflow`

| Component | Artifact | SHA-256 | Files | Target | Deployment | Result |
| --- | --- | --- | ---: | --- | --- | --- |
| Backend | `C:\Users\hubay\AppData\Local\Temp\adminiculum-task-lifecycle-prod-4647c08-20260719T162339Z\adminiculum-backend-task-lifecycle-4647c08.zip` | `f60e1492a04064f590529ee6981b80f2ed03a2b51177bb72e7f0026c8ef63f03` | 165 | `adminiculumbackend-b1-01` | `be17637b-5431-4de6-a96a-98fe8ada884a` | active |
| Failed frontend candidate | `C:\Users\hubay\AppData\Local\Temp\adminiculum-task-lifecycle-prod-4647c08-20260719T162339Z\adminiculum-frontend-task-lifecycle-4647c08.zip` | `987a77f4ef0ad27142ce440d4d06230e57937951e00edbb759b67fa2e733768c` | 121 | `adminiculumfrontend-austriaeast-01` | `a27dcd43-96a9-44de-bcde-8657a4bb4bb6` | transport-interrupted before activation |
| Prior frontend rollback | `C:\Users\hubay\AppData\Local\Temp\adminiculum-sol56-ux-release\adminiculum-frontend-sol56-ux-1033a4d.zip` | `68ec4754616a1b61dfa8aefdb28790605afc7333f2a2d5d3f7cfdb45ee746ae5` | 117 | `adminiculumfrontend-austriaeast-01` | `f1ab9847-fb1a-4e7f-9c8a-e103904c2711` | historical rollback, inactive |
| Recovery frontend | `C:\Users\hubay\AppData\Local\Temp\adminiculum-task-lifecycle-frontend-recovery-20260719T175043Z\adminiculum-frontend-task-lifecycle-recovery-4647c08.zip` | `3c41d5efa4c040c1b11acbbb7b5caa587d7941d5208e7c8116360b96fb4afeaa` | 122 | `adminiculumfrontend-austriaeast-01` | `2af5724d-277b-49ad-997d-80f557a36aff` | active |

## Recovery Manifest

The recovery artifact contains a fresh embedded manifest with runtime source `4647c08`, branch, compatible backend deployment, required migration head, production API target, target App Service, build timestamp, file count, and external sidecar authority. The external sidecar records the immutable archive SHA-256, byte size, deployment ID, Kudu status, and rollback result.

The deployed manifest was read back from `/home/site/wwwroot/release-manifest.json` and matched the approved runtime source and compatibility tuple.

## Component And Contamination Guard

The recovery frontend ZIP contains only frontend Oryx source and its manifest. It contains no backend, docs, Prisma, migration, SQL, `.git`, actual environment file, screenshot, local auth file, node modules, `.next`, or prior ZIP. Production `.next` bundles contain no `localhost:3001` or `/api/v1/auth/login` target.

Backend artifact and deployment were not changed during frontend recovery.
