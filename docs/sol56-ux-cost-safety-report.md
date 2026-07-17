# SOL56 UX Cost Safety Report

Date: 2026-07-17
Resource group: `Adminiculum`

## Preflight

- Existing resources in the resource group: `3`.
- Existing App Service Plan: `ASP-AdminiculumRG-be7b`.
- SKU: `B1` / `Basic`.
- Capacity: `1`.
- Sites on plan: `2`.
- Per-site scaling: disabled.
- Elastic scaling: disabled.
- Existing slots on both apps: `0`.
- Backend live instances/workers: `1` / `1`.
- Frontend live instances/workers: `1` / `1`.
- Backend `Always On`: `false` before deployment.
- Frontend `Always On`: `true` before deployment.
- Backend state: `Running`.
- Frontend state: `Running`.

Safe non-secret feature/public settings observed before deployment:

- `ENABLE_COMMUNICATIONS_PERSISTENCE=true`.
- `ENABLE_CLIENT_PORTAL_PUBLIC=false`.
- `ENABLE_OUTLOOK_IMPORT` absent.
- `ENABLE_CONTRACTS` absent.
- `NEXT_PUBLIC_BACKEND_BASE_URL=https://adminiculumbackend-b1-01.azurewebsites.net`.
- Local frontend auth flag absent.

## Allowed Writes

Exactly two Azure write commands ran, both ZIP deployments to existing apps:

1. backend OneDeploy to `adminiculumbackend-b1-01`;
2. frontend OneDeploy to `adminiculumfrontend-austriaeast-01`.

No resource creation, plan/SKU change, scale change, slot operation, app-setting write, container action, database action, monitoring action, restart command, or infrastructure deployment command ran.

## Postflight

- Resource count: still `3`.
- Plan: still `ASP-AdminiculumRG-be7b`, `B1`, capacity `1`.
- Sites on plan: still `2`.
- Per-site and elastic scaling: still disabled.
- Slots: still `0`.
- Both apps: `Running`.
- Both apps: one live instance and one configured worker.
- `Always On`, minimum elastic instance count, pre-warmed instance count, Linux runtime, and all app-setting names are unchanged.
- Configuration writes: `0`.
- Resources created: `0`.

## Cost Conclusion

Azure cost impact from this release: **none**. The deployment reused the existing Basic B1 plan and existing two App Services without changing capacity, scale, SKU, slots, settings, region, or resource inventory.
