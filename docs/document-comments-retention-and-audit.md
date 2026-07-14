# Document Comments Retention and Audit

## Retention

The current model supports hard deletion technically, but no approved product retention/delete policy exists. The implemented contract therefore disables delete and preserves comment rows through resolve/reopen.

## Audit and notifications

This pass does not add audit events, timeline entries, notifications, task updates, or external messages. That avoids leaking comment body into generic activity surfaces.

Future audit may record only scalar metadata: comment id, document id, case id, actor id, event type, and timestamp.
