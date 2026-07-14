# Document Editor Review State Contract

## Current contract

The professional editor uses the existing task-backed workflow. It does not introduce a new review-state model.

```ts
{
  editorSession: {
    persistenceMode: "EXPORT_ONLY",
    serverSaved: false,
    reviewerCanAccessCurrentSession: false
  }
}
```

## Supported actions

Review task creation and task transitions remain backend-authorized. Frontend controls render from backend-derived capabilities and refresh work items after transitions.

## Mode C rule

Review task creation/submission never uploads, exports, saves, or attaches current browser editor content. Dirty sessions require explicit confirmation.
