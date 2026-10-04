import { Prisma, PrismaClient } from '@prisma/client';

export function closureTrace(event: string, detail: object) {
  if (process.env.CASE_CLOSURE_TRACE === '1') {
    console.log('CLOSURE_TRACE ' + JSON.stringify({ test: expect.getState().currentTestName, event, ...detail }));
  }
}

/** Test-only observation: every production statement still runs on its real transaction. */
export function traceClosureTransactions(db: PrismaClient, actor: string) {
  if (process.env.CASE_CLOSURE_TRACE !== '1') return;
  const actual = db.$transaction.bind(db);
  jest.spyOn(db, '$transaction').mockImplementation((async (operation: any, options: any) => {
    let identity: any;
    try {
      const result = await actual(async (tx: Prisma.TransactionClient) => {
        const metadata = async () => (await tx.$queryRaw<any[]>`
          SELECT pg_backend_pid() AS pid, txid_current()::text AS xid,
            current_setting('transaction_isolation') AS isolation,
            txid_current_snapshot()::text AS snapshot
        `)[0];
        identity = await metadata();
        closureTrace('begin-snapshot', { actor, ...identity });
        const proxy = new Proxy(tx, {
          get(target, key) {
            if (key === '$queryRaw') return async (...args: any[]) => {
              const sql = args[0]?.sql || String(args[0]);
              const isCaseLock = sql.includes('FROM "cases"') && sql.includes('FOR UPDATE');
              const caseId = args[0]?.values?.[0];
              if (isCaseLock) closureTrace('lock-request', { actor, ...identity, caseId });
              const result = await (target.$queryRaw as any)(...args);
              if (isCaseLock) closureTrace('lock-acquired', { actor, ...await metadata(), caseId, rows: result });
              return result;
            };
            const value = (target as any)[key];
            if (value && typeof value.count === 'function') return new Proxy(value, {
              get(model, method) {
                if (method === 'count') return async (args: any) => {
                  const count = await model.count(args);
                  closureTrace('count', { actor, ...await metadata(), model: String(key), where: args.where, count });
                  return count;
                };
                return model[method];
              },
            });
            return value;
          },
        });
        return operation(proxy);
      }, options);
      closureTrace('commit', { actor, ...identity });
      return result;
    } catch (error: any) {
      closureTrace('rollback', { actor, ...identity, code: error.code, meta: error.meta });
      throw error;
    }
  }) as any);
}
