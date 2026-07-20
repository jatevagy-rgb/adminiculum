# Client Color Review Projection

Submitted queue rows resolve color in the existing `TaskSubmission -> Task -> Case -> Client` select. The mapper removes the nested Prisma client and returns only `case.clientColorKey`.

Legacy task rows use their real task case/client relation; absent color remains neutral. Review detail adds `client.clientColorKey` to the existing safe client identity DTO. Review versions, decisions, attention, urgency, idempotency, and lifecycle transitions are unchanged.
