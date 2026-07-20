# Dashboard Color Hierarchy

## Three Independent Layers

1. **Brand/navigation:** dark green for action links, icons, selection, and focus.
2. **Client identity:** existing `ClientColorKey` rendered only as a narrow rail with neutral fallback.
3. **Workflow/urgency:** light semantic tones and explicit labels for office action, review, client waiting, unspecified work, due-soon, and overdue.

Client color never determines workflow state, urgency, selection, or action priority. Workflow meaning is always accompanied by text. No persisted color key or global theme token changed.

The page background remains a warm near-white rather than yellow/beige; content panels remain white with light borders and minimal shadows.
