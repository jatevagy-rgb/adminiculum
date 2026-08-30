# Product flow graph

| Arrow | CURRENT CONNECTION | HISTORICAL CONNECTION | BEST EVER IMPLEMENTATION | CURRENT GAP | RECOVERY |
|---|---|---|---|---|---|
| inbound communication → client | Outlook/import carries client assignment fields | intake and Outlook variants | PR95 inbound workbench | live Graph/config unproven | finish gated runtime proof |
| client → case | canonical intake routes exist | transactional intake `02e02d8` | current service boundary | multiple creation paths | converge through `createCase` |
| case → case type | current models/routes and PR98 input | workflow selection `9885e5b` | PR98 compact flow | active branch only | merge semantics |
| case type → work package | legacy instantiation proven | `9eec7bf`, PR87 lineage | PR98 snapshot creation | modern canonical path gap | PR98 after PR96 |
| work package → task | runtime/task provenance exists on PR96 | DAG/work-item engines | PR96 runtime | canonical release predates runtime | stack order |
| task → document | work context/two-way task links | `68c8a7c` | current work context | not universal across paths | reconnect |
| document → version | current immutable lifecycle | `ce55a80` | canonical version UI | none material | keep |
| version → review | current review subsystem | `d1d8fd6` | review workflow | queue UX uneven | surface |
| review → lawyer decision | task/review decision routes | `4cbe4ee`, `3634cb5` | current review decision | case-level reviewer greenfield | build safely |
| deadline → agenda | agenda reads case deadline | typed intake deadlines historical | current agenda service | intake field mapping gap | reconnect |
| task → time | time entries and case query exist | `d49d410` | case-aware time page | cross-link not universal | reconnect |
| document → publication | publication routes and portal surfaces | `2975942` | customer-safe publication | internal intake grant cut | resolve grant semantics |
| communication → responsible lawyer | case creation route exists | PR95 | PR98 validation pattern | assigned lawyer gap in PR95 path | replay validation |

## Organizational flow

Client → Organization → Portal → Company Profile → Fact → Compliance evaluation → Finding → Proposal → Case → Work Package → Task → customer-visible progress is historically broad and mostly canonical through Phase 5–7 and PR72/79. The internal-intake-to-portal grant edge remains a product/security decision, not an assumed side effect.
