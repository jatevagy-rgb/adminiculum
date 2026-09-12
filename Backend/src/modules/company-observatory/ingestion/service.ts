import { PrismaClient, ExternalSourceStatus, DiscoveryRunStatus, ObservationType, Prisma } from '@prisma/client';
import { canonicalDigest } from '../../compliance/canonicalDigest';
import { assertClientReadAccess, InternalActor } from '../../client-interaction/base';
import { RegisterExternalSourceArgs, IngestObservationArgs } from './types';

const prisma = new PrismaClient();

export function validateNoSecrets(config: any) {
  if (config === null || typeof config !== 'object') return;
  const forbiddenKeys = ['accesstoken', 'refreshtoken', 'apikey', 'clientsecret', 'password', 'privatekey'];
  
  for (const [key, value] of Object.entries(config)) {
    if (forbiddenKeys.includes(key.toLowerCase())) {
      throw new Error('Forbidden secret key found in configuration');
    }
    if (typeof value === 'object' && value !== null) {
      validateNoSecrets(value);
    }
  }
}

export class ObservatoryIngestionService {
  async registerExternalSource(actor: InternalActor, args: RegisterExternalSourceArgs) {
    await assertClientReadAccess(actor, args.clientId, prisma);
    validateNoSecrets(args.config);
    return await prisma.externalSourceConnection.create({
      data: {
        clientId: args.clientId,
        sourceType: args.sourceType,
        name: args.name,
        config: args.config ?? Prisma.JsonNull,
        status: ExternalSourceStatus.ACTIVE,
      },
    });
  }

  async updateExternalSourceStatus(actor: InternalActor, args: { clientId: string; connectionId: string; status: ExternalSourceStatus }) {
    await assertClientReadAccess(actor, args.clientId, prisma);
    return await prisma.externalSourceConnection.update({
      where: { id_clientId: { id: args.connectionId, clientId: args.clientId } },
      data: { status: args.status },
    });
  }

  async startDiscoveryRun(actor: InternalActor, args: { clientId: string; connectionId: string }) {
    await assertClientReadAccess(actor, args.clientId, prisma);
    return await prisma.discoveryRun.create({
      data: {
        clientId: args.clientId,
        connectionId: args.connectionId,
        status: DiscoveryRunStatus.RUNNING,
      },
    });
  }

  async completeDiscoveryRun(actor: InternalActor, args: { clientId: string; runId: string }) {
    await assertClientReadAccess(actor, args.clientId, prisma);
    return await prisma.discoveryRun.update({
      where: { id_clientId: { id: args.runId, clientId: args.clientId } },
      data: {
        status: DiscoveryRunStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async failDiscoveryRun(actor: InternalActor, args: { clientId: string; runId: string }) {
    await assertClientReadAccess(actor, args.clientId, prisma);
    return await prisma.discoveryRun.update({
      where: { id_clientId: { id: args.runId, clientId: args.clientId } },
      data: {
        status: DiscoveryRunStatus.FAILED,
        completedAt: new Date(),
      },
    });
  }

  async markDiscoveryRunPartial(actor: InternalActor, args: { clientId: string; runId: string }) {
    await assertClientReadAccess(actor, args.clientId, prisma);
    return await prisma.discoveryRun.update({
      where: { id_clientId: { id: args.runId, clientId: args.clientId } },
      data: {
        status: DiscoveryRunStatus.PARTIAL,
        completedAt: new Date(),
      },
    });
  }

  async ingestObservation(actor: InternalActor, args: IngestObservationArgs) {
    await assertClientReadAccess(actor, args.clientId, prisma);

    // Verify run and connection belong to client (implied by unique constraints, but explicit check avoids opaque P2025)
    const run = await prisma.discoveryRun.findUnique({
      where: { id_clientId_connectionId: { id: args.discoveryRunId, clientId: args.clientId, connectionId: args.connectionId } }
    });
    if (!run) throw new Error('Invalid run or connection ID for this client');

    const inputDigest = canonicalDigest(args.rawPayload);
    const observedAt = args.observedAt || new Date();

    try {
      return await prisma.observation.create({
        data: {
          clientId: args.clientId,
          connectionId: args.connectionId,
          discoveryRunId: args.discoveryRunId,
          idempotencyKey: args.idempotencyKey,
          sourceRecordId: args.sourceRecordId,
          inputDigest,
          observationType: args.observationType || ObservationType.GENERIC_RECORD,
          rawPayload: args.rawPayload ?? Prisma.JsonNull,
          observedAt,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const existing = await prisma.observation.findUnique({
          where: {
            clientId_connectionId_idempotencyKey: {
              clientId: args.clientId,
              connectionId: args.connectionId,
              idempotencyKey: args.idempotencyKey,
            },
          },
        });
        if (existing) {
          if (existing.inputDigest === inputDigest) {
            return existing;
          } else {
            throw new Error('IDEMPOTENCY_CONFLICT');
          }
        }
      }
      throw error;
    }
  }

  async getObservation(actor: InternalActor, args: { clientId: string; observationId: string }) {
    await assertClientReadAccess(actor, args.clientId, prisma);
    return await prisma.observation.findUnique({
      where: { id_clientId: { id: args.observationId, clientId: args.clientId } }
    });
  }

  async listObservationsForRun(actor: InternalActor, args: { clientId: string; runId: string }) {
    await assertClientReadAccess(actor, args.clientId, prisma);
    return await prisma.observation.findMany({
      where: { discoveryRunId: args.runId, clientId: args.clientId }
    });
  }
}
