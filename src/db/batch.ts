/**
 * Atomic multi-statement writes that work on both backends.
 *
 * - D1 has no interactive transactions; `db.batch([...])` runs the statements
 *   atomically, in order.
 * - Postgres runs the same statements sequentially inside a transaction.
 *
 * Build every statement from the `tx` handed to `build` — on Postgres,
 * statements built from the outer `db` would run outside the transaction.
 * Statements can't depend on each other's results, so generate ids up front.
 */
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from './index';
import { getDatabaseProvider } from './provider';

type Statement = BatchItem<'sqlite'>;

export async function runBatch(db: Db, build: (tx: Db) => Statement[]): Promise<void> {
  if (getDatabaseProvider() === 'postgres') {
    const pg = db as unknown as { transaction: (fn: (tx: Db) => Promise<void>) => Promise<void> };
    await pg.transaction(async (tx) => {
      for (const statement of build(tx)) await statement;
    });
    return;
  }

  const statements = build(db);
  if (statements.length === 0) return;
  await db.batch(statements as [Statement, ...Statement[]]);
}
