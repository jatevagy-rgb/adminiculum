import { ExternalSourceStatus, DiscoveryRunStatus, ObservationType, Prisma } from '@prisma/client';

export interface RegisterExternalSourceArgs {
  clientId: string;
  sourceType: string;
  name: string;
  config?: Prisma.InputJsonValue;
}

export interface IngestObservationArgs {
  clientId: string;
  connectionId: string;
  discoveryRunId: string;
  idempotencyKey: string;
  sourceRecordId?: string;
  observationType?: ObservationType;
  rawPayload: Prisma.InputJsonValue;
  observedAt?: Date;
}
