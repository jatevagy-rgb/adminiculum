# Dashboard task attention workload

The Dashboard workload block is titled `Milyen munkák várnak rám?`.

## Source

The block reads a server-computed projection from the authenticated dashboard operational overview response.

## DTO shape

```json
{
  "attentionWorkload": {
    "categories": [
      {
        "attentionCategory": "QUICK_SCAN",
        "count": 0,
        "minMinutes": 0,
        "maxMinutes": 0,
        "nearestDeadline": null
      }
    ],
    "unclassified": {
      "count": 0,
      "nearestDeadline": null
    }
  }
}
```

All five categories are always returned in canonical order. Unclassified Tasks are counted separately and do not receive fabricated duration.

## Query shape

The backend workload query is bounded, assigned-user scoped, and selects only:

- `id`
- `assignedToId`
- `status`
- `attentionCategory`
- `estimatedMinutes`
- `dueDate`

Task titles and descriptions are not selected for aggregation.
