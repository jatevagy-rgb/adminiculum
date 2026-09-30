import { Prisma, PrismaClient } from '@prisma/client';
import { deriveLifecycleCategory } from './lifecycle';
import { WorkflowTransitionError } from './workItems';

type Tx = Prisma.TransactionClient;

export class CaseMutationGuardError extends WorkflowTransitionError {
  constructor(statusCode: number, code: string, message: string) {
    super(statusCode, code, message);
    this.name = 'CaseMutationGuardError';
  }
}

/** The case row is the common, case-scoped lock for closure and work writers. */
export async function lockCaseForMutation(tx: Tx, caseId: string, requireOpen = true): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ status: string }>>(
    Prisma.sql`SELECT "status"::text AS "status" FROM "cases" WHERE "id" = ${caseId} FOR UPDATE`
  );
  if (rows.length !== 1) throw new CaseMutationGuardError(404, 'CASE_NOT_FOUND', 'Case not found.');
  const status = rows[0].status;
  const category = deriveLifecycleCategory(status);
  if (requireOpen && (category === 'CLOSED' || category === 'ARCHIVED')) {
    throw new CaseMutationGuardError(409, 'CASE_REOPEN_REQUIRED', 'Reopen the case before creating or resuming work.');
  }
  return status;
}

export async function lockTaskCaseForWork(tx: Tx, taskId: string): Promise<string> {
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { caseId: true } });
  if (!task) throw new CaseMutationGuardError(404, 'TASK_NOT_FOUND', 'Task not found.');
  await lockCaseForMutation(tx, task.caseId);
  return task.caseId;
}

export async function withCaseWorkGuard<T>(
  db: PrismaClient | Tx,
  caseId: string,
  operation: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!('$transaction' in db)) {
    await lockCaseForMutation(db, caseId);
    return operation(db);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        await lockCaseForMutation(tx, caseId);
        return operation(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') || attempt === 2) throw error;
    }
  }
  throw new CaseMutationGuardError(409, 'CASE_WORK_CONFLICT', 'Case work changed concurrently.');
}
