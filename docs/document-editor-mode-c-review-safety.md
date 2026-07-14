# Document Editor Mode C Review Safety

Mode C means the edited content exists only in the current browser/editor memory until the user explicitly exports it.

## Hard rules

- no server save;
- no autosave;
- no localStorage/sessionStorage;
- no workspaceText use;
- no automatic upload on review;
- no reviewer-visible claim for unsaved content;
- no dirty-state clearing after local export or review action.

## Implemented safety

Dirty review creation/submission shows a confirmation explaining that the review task is linked to the document record, not the current browser editing state.
