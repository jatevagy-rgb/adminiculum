# Task attention API contract

## Fields

Every authorized Task read response should expose:

```json
{
  "attentionCategory": "DETAILED_REVIEW",
  "estimatedMinutes": 90
}
```

Legacy or unclassified Tasks remain valid:

```json
{
  "attentionCategory": null,
  "estimatedMinutes": null
}
```

## Accepted attention categories

- `QUICK_SCAN`
- `APPROVAL`
- `SIGNATURE`
- `EDITING`
- `DETAILED_REVIEW`

Unknown, lowercase, altered, or arbitrary values are rejected with `INVALID_ATTENTION_CATEGORY`.

## Estimated minutes

Accepted values are `null` or an integer from `1` to `480`.

Invalid values are rejected with `INVALID_ESTIMATED_MINUTES`, including zero, negative numbers, decimals, `NaN`, strings, and values above `480`.

## Routes

- Existing Task create accepts the nullable fields.
- Existing Task read/list paths return the fields.
- `PATCH /api/v1/tasks/:id/attention` updates only `attentionCategory` and `estimatedMinutes`.

The update route does not reassign, change status, or modify case/document/source relationships.
