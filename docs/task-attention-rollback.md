# Task attention rollback

## Backend rollback

If backend deployment activates but health or auth behavior regresses, perform one backend rollback and do not deploy frontend.

## Frontend rollback

If frontend deployment activates but acceptance fails, perform one frontend rollback. The backend may remain if it is healthy and backward-compatible.

## Database state

Do not roll back the production schema for a runtime deployment failure. The nullable Task fields are backward-compatible and the migration was already applied before this runtime ticket.
