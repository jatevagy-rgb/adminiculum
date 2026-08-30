# UI resurrection candidates

| Old SHA | Current SHA | Surface | Better | Bad | Recover only | Cost/dependencies |
|---|---|---|---|---|---|---|
| `fb8c9bb` | `c0ec1df` | Case overview | summary-first cockpit and attention context | dense sidebar generations | context blocks and prioritization | low; current case auth |
| `2729450` | `c0ec1df` | Case intake | workspace framing over six-step wizard | older field breadth | compact contextual semantics | medium; PR98 |
| `511c9fb` | `c0ec1df` | Documents | explicit case-context entry points | transitional route duplication | labels/action hierarchy | low |
| `40c1bf1` | `c0ec1df` | Contract workspace | active-document cockpit and responsive shell | browser-editor temptation | header/context semantics | low |
| `874933a` | `c0ec1df` | Communication inbox | triage/contextual intake | earlier broad action density | context and primary actions | medium; PR95 auth |
| `b1d1d82` | `c0ec1df` | Navigation | simpler primary shell | some surfaces became less discoverable | coherent grouping | low |
| `338eaac` | `c0ec1df` | Organization portal | customer-safe home flow | depends on grant state | empty/loading/explanation patterns | low |

Never resurrect `0f5d923` mock portal or old browser editor as a whole. Security classification: semantic candidates are `SAFE_SEMANTIC_REPLAY`; old identity/mock flows are `DO_NOT_RECOVER`.
