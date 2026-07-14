# Document Editor Review Comments Acceptance

## Automated checks

- Branch C comments decision is asserted in `documentEditorReviewQuality.test.ts`.
- Mode C review-state flags are asserted.
- Compare wording avoids track-changes/current-session claims.
- Static guards prevent editor coupling to hidden persistence, browser storage, external converters, AI SDKs, n8n, Client Portal, direct Graph/SharePoint, and fake comment anchors.

## Manual checks

- `/documents/new/edit` shows “Munkamenet — nincs szerverre mentve”.
- Dirty review task creation/submission shows the Mode C warning.
- Compare link says “Mentett források összehasonlítása”.
- DOCX import cancel/failure preserves existing content.
- Keyboard-only search can open, navigate, and close.
- `/portal` remains unchanged.
