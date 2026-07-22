# Task attention audit events

Attention changes are recorded with content-light Task timeline events.

## Recorded data

- Task ID
- Changed field
- Old value
- New value
- Actor ID through the timeline event context
- Timestamp through the existing timeline mechanism

## Not recorded

- Task title
- Task description
- Document content
- Legal analysis
- Client communication text
- Case narrative

The audit event uses the existing timeline mechanism and avoids duplicate detailed business-content logging.
