# Document Comments Editor Integration

The professional editor side panel exposes a “Dokumentumszintű megjegyzések” tab.

## Behavior

- list document-level comments;
- create bounded plain-text comments;
- resolve/reopen when backend capabilities allow;
- show loading, error, retry, and empty states;
- keep character counter and Ctrl/Cmd+Enter submit.

## Boundaries

Comments are document metadata. They do not save editor content, clear dirty state, attach the current browser session, create review tasks, or create text anchors/highlights.
