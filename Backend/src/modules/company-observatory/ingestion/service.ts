// Service
import crypto from 'crypto';
export function validateNoSecrets(obj: any) {
  const str = JSON.stringify(obj).toLowerCase();
  const bad = ['accesstoken', 'refreshtoken', 'apikey', 'clientsecret', 'password', 'privatekey'];
  for (const b of bad) {
    if (str.includes('"' + b + '"')) throw new Error('Secret in config');
  }
}
export function getDigest(payload: any) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
export class ObservatoryIngestionService {
  async registerExternalSource(args: any) {
    validateNoSecrets(args.config);
    return {};
  }
  async ingestObservation(args: any) {
    return {};
  }
}
