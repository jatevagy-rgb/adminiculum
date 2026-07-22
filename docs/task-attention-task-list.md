# Task attention list behavior

The Tasks page shows attention-category information without replacing existing Task lifecycle controls.

## Additions

- Attention category badge.
- Estimated effort text.
- Category filter.
- Unclassified filter via `attentionCategory=UNCLASSIFIED`.

## URL filters

- `/tasks?attentionCategory=QUICK_SCAN`
- `/tasks?attentionCategory=APPROVAL`
- `/tasks?attentionCategory=SIGNATURE`
- `/tasks?attentionCategory=EDITING`
- `/tasks?attentionCategory=DETAILED_REVIEW`
- `/tasks?attentionCategory=UNCLASSIFIED`

Unsupported query values are ignored safely and fall back to the full list.
