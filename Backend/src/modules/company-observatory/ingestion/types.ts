// types
export interface RegisterSourceArgs { clientId: string; sourceType: string; name: string; config: Record<string, any>; }
export interface IngestObservationArgs { clientId: string; connectionId: string; discoveryRunId: string; idempotencyKey: string; observationType: any; rawPayload: any; }
