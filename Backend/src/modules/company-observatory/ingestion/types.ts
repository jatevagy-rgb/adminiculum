import { ExternalSourceStatus, DiscoveryRunStatus, ObservationType } from '@prisma/client';

export interface RegisterExternalSourceArgs {
  clientId: string;
  sourceType: string;
  name: string;
  config?: any;
}

export interface IngestObservationArgs {
  clientId: string;
  connectionId: string;
  discoveryRunId: string;
  idempotencyKey: string;
  observationType?: ObservationType;
  rawPayload: any;
}
