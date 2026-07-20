# Dashboard Case Waiting State Audit

## Result

The current schema supports a useful but deliberately limited operational grouping. No free-text inference is permitted.

| Operational group | Persisted source | Reliable | DTO change | Fallback |
| --- | --- | --- | --- | --- |
| `Határidő közeleg` | Case deadline and open-task due dates | Yes | Included | Earliest persisted date; overdue flag is computed from that date. |
| `Nálunk van a következő lépés` | Actor-owned actionable task or actor-assigned case in supported active state | Yes | Included | Case workspace action when no task action exists. |
| `Review alatt` | Assigned submission review or persisted review status | Yes | Included | Review queue link. |
| `Ügyfélre várunk` | `SENT_TO_CLIENT` case status or `CLIENT_WAITING` stuck reason | Yes, where explicitly persisted | Included | Neutral unspecified group when absent. |
| `Ellenoldalra várunk` | No dedicated persisted field | No | Not included | `Nincs meghatározott következő lépés`. |
| `Hatóságra / bíróságra várunk` | No dedicated persisted field | No | Not included | `Nincs meghatározott következő lépés`. |
| `Nincs meghatározott következő lépés` | No supported persisted classification matched | Yes | Included | Safe neutral state. |

## Priority

1. Overdue or approaching deadline.
2. Office action required.
3. Review required.
4. Explicit client waiting.
5. Unspecified.

Within a group, ordering uses earliest deadline, oldest unresolved persisted activity, and stable Hungarian title ordering.

## Separate Future Requirement

Counterparty and authority/court waiting states need explicit persisted case-workspace fields and a separately approved schema/runtime ticket. They must not be inferred from case titles, task titles, communication content, or notes.
