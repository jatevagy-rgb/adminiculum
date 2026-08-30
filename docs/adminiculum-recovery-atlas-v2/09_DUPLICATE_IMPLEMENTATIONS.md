# Duplicate and parallel implementations

| Concept | Implementation A | Implementation B/C | Current canonical | Best product action |
|---|---|---|---|---|
| workflow | `Backend/src/modules/cases/workflow.ts` status/state predecessor | DAG/orchestration, work-package runtime, task lifecycle, document review | DAG + work package + lifecycle modules | deprecate dead predecessors; converge events |
| case creation | legacy `createCase`/intake | compact Work Package flow PR98; communication-created case PR95 | current service boundary | one transaction and role validator |
| work package | admin definitions | legacy instantiation + PR96 runtime + PR98 snapshot | active recovery stack | merge semantics, no blind cherry-pick |
| communications | canonical inbox | `peterfi/communicationWorkspace`, client/case read models | canonical inbox plus replayed projections | merge context/read model |
| comparison | metadata/version panel | structured diff engine + DOCX/PDF extractor | canonical comparison boundary | converge on safe typed segments |
| portal | individual portal | organization portal/Phase 5 CP1 | current identity-scoped portal modes | preserve separation; reject mock portal |
| compliance | foundation evaluator | Phase 7 finding/task/proposal and demo | compliance modules/read models | keep canonical chain |
| document extraction | old ad hoc providers | shared extractor in PR94 | shared extractor | one provider policy and limits |
| time/workload | time entries/reports | dashboard/workload/capacity read models | current time + workload surfaces | reconnect case/task context |
| storage | SharePoint/Graph drive service | local/fixture adapters in tests and historical branches | SharePoint boundary | do not merge test adapters into runtime |

`DUPLICATE` does not mean equivalent. Security state and evidence are required before convergence.
