import { PrismaClient, ExternalSourceStatus, DiscoveryRunStatus, ObservationType } from '@prisma/client';
import { canonicalDigest } from '../../compliance/canonicalDigest';

const prisma = new PrismaClient();

export function validateNoSecrets(config: any) {
  if (!config) return;
  const stringified = JSON.stringify(config).toLowerCase();
  const forbiddenKeys = ['accesstoken', 'refreshtoken', 'apikey', 'clientsecret', 'password', 'privatekey'];
  for (const key of forbiddenKeys) {
    if (stringified.includes(`"${key}"`)) {
      throw new Error('Forbidden secret key found in configuration');
    }
  }
}

export class ObservatoryIngestionService {
  async registerExternalSource(args: { clientId: string; sourceType: string; name: string; config: any }) {
    validateNoSecrets(args.config);
    return await prisma.externalSourceConnection.create({
      data: {
        clientId: args.clientId,
        sourceType: args.sourceType,
        name: args.name,
        config: args.config || {},
        status: ExternalSourceStatus.ACTIVE,
      },
    });
  }

  async startDiscoveryRun(args: { clientId: string; connectionId: string }) {
    return await prisma.discoveryRun.create({
      data: {
        clientId: args.clientId,
        connectionId: args.connectionId,
        status: DiscoveryRunStatus.RUNNING,
      },
    });
  }

  async completeDiscoveryRun(args: { clientId: string; runId: string }) {
    return await prisma.discoveryRun.update({
      where: { id: args.runId, clientId: args.clientId },
      data: {
        status: DiscoveryRunStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async failDiscoveryRun(args: { clientId: string; runId: string }) {
    return await prisma.discoveryRun.update({
      where: { id: args.runId, clientId: args.clientId },
      data: {
        status: DiscoveryRunStatus.FAILED,
        completedAt: new Date(),
      },
    });
  }

  async markDiscoveryRunPartial(args: { clientId: string; runId: string }) {
    return await prisma.discoveryRun.update({
      where: { id: args.runId, clientId: args.clientId },
      data: {
        status: DiscoveryRunStatus.PARTIAL,
        completedAt: new Date(),
      },
    });
  }

  async ingestObservation(args: {
    clientId: string;
    connectionId: string;
    discoveryRunId: string;
    idempotencyKey: string;
    observationType?: ObservationType;
    rawPayload: any;
  }) {
    const inputDigest = canonicalDigest(args.rawPayload);

    try {
      return await prisma.observation.create({
        data: {
          clientId: args.clientId,
          connectionId: args.connectionId,
          discoveryRunId: args.discoveryRunId,
          idempotencyKey: args.idempotencyKey,
          inputDigest,
          observationType: args.observationType || ObservationType.GENERIC_RECORD,
          rawPayload: args.rawPayload,
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
}
