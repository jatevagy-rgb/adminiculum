import nodemailer from 'nodemailer';
import {
  getTransactionalMailTransport,
  setTransactionalMailTransport,
} from '../src/modules/mailbox/transactionalMail';

const SMTP_ENV = [
  'MAILBOX_TRANSACTIONAL_SMTP_HOST',
  'MAILBOX_TRANSACTIONAL_SMTP_PORT',
  'MAILBOX_TRANSACTIONAL_SMTP_USER',
  'MAILBOX_TRANSACTIONAL_SMTP_PASSWORD',
  'MAILBOX_TRANSACTIONAL_SMTP_FROM',
  'MAILBOX_TRANSACTIONAL_SMTP_SECURE',
] as const;

describe('transactional verification SMTP transport', () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of SMTP_ENV) previous.set(name, process.env[name]);
    setTransactionalMailTransport(null);
  });

  afterEach(() => {
    setTransactionalMailTransport(null);
    jest.restoreAllMocks();
    for (const name of SMTP_ENV) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function configure(port: string) {
    process.env.MAILBOX_TRANSACTIONAL_SMTP_HOST = 'smtp.example.test';
    process.env.MAILBOX_TRANSACTIONAL_SMTP_PORT = port;
    process.env.MAILBOX_TRANSACTIONAL_SMTP_USER = 'mailer@example.test';
    process.env.MAILBOX_TRANSACTIONAL_SMTP_PASSWORD = 'password';
    process.env.MAILBOX_TRANSACTIONAL_SMTP_FROM = 'Adminiculum <mailer@example.test>';
  }

  it('uses implicit TLS for port 465', async () => {
    configure('465');
    const sendMail = jest.fn().mockResolvedValue({});
    const createTransport = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as any);

    await getTransactionalMailTransport().sendVerificationCode({
      email: 'owner@example.test',
      code: '123456',
      expiresAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true, requireTLS: false }));
    expect(sendMail).toHaveBeenCalled();
  });

  it('requires STARTTLS for non-465 submission ports', async () => {
    configure('587');
    process.env.MAILBOX_TRANSACTIONAL_SMTP_SECURE = 'true';
    const sendMail = jest.fn().mockRejectedValue(new Error('TLS_REQUIRED'));
    const createTransport = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as any);

    await expect(getTransactionalMailTransport().sendVerificationCode({
      email: 'owner@example.test',
      code: '123456',
      expiresAt: new Date('2026-01-01T00:00:00Z'),
    })).rejects.toThrow('TLS_REQUIRED');
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true }));
  });
});
