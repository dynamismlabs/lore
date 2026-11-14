/**
 * Full SQL dump of a D1 database (schema + rows), restorable with
 * `wrangler d1 execute <db> --remote --file dump.sql` into an empty database.
 *
 * No imports and no app code: this runs from the Worker's scheduled handler
 * with only the D1 binding.
 */
const PAGE = 500;

interface SchemaObject {
  type: 'table' | 'index' | 'trigger' | 'view';
  name: string;
  sql: string;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return `X'${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}'`;
  }
  if (Array.isArray(value)) return sqlValue(new Uint8Array(value as number[]));
  return `'${String(value).replace(/'/g, "''")}'`;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Topologically sort tables so referenced tables come before referencing ones. */
function orderByDependencies(tables: SchemaObject[]) {
  const names = new Set(tables.map((t) => t.name));
  const deps = new Map(
    tables.map((t) => [
      t.name,
      new Set(
        [...t.sql.matchAll(/REFERENCES\s+[`"[]?(\w+)[`"\]]?/gi)]
          .map((m) => m[1])
          .filter((name) => names.has(name) && name !== t.name),
      ),
    ]),
  );
  const ordered: SchemaObject[] = [];
  const done = new Set<string>();
  const visit = (table: SchemaObject, seen: Set<string>) => {
    if (done.has(table.name) || seen.has(table.name)) return;
    seen.add(table.name);
    for (const dep of deps.get(table.name) ?? []) visit(tables.find((t) => t.name === dep)!, seen);
    done.add(table.name);
    ordered.push(table);
  };
  for (const table of tables) visit(table, new Set());
  return ordered;
}

export interface DumpResult {
  sql: string;
  tables: number;
  rows: number;
}

export async function dumpD1(db: D1Database): Promise<DumpResult> {
  const { results } = await db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
       ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`,
    )
    .all<SchemaObject>();

  const lines = [
    `-- Lore D1 backup, ${new Date().toISOString()}`,
    '-- Restore into an EMPTY database: wrangler d1 execute <db> --remote --file <this file>',
    'PRAGMA defer_foreign_keys = TRUE;',
  ];
  const tables = orderByDependencies(results.filter((o) => o.type === 'table'));
  let rows = 0;

  // All tables first, then rows parents-before-children so foreign keys hold
  // even where deferral isn't available.
  lines.push('', ...tables.map((t) => `${t.sql};`));
  for (const table of tables) {
    lines.push('');
    for (let offset = 0; ; offset += PAGE) {
      const page = await db
        .prepare(`SELECT * FROM ${quote(table.name)} ORDER BY rowid LIMIT ? OFFSET ?`)
        .bind(PAGE, offset)
        .all<Record<string, unknown>>();
      for (const row of page.results) {
        const columns = Object.keys(row);
        lines.push(
          `INSERT INTO ${quote(table.name)} (${columns.map(quote).join(', ')}) VALUES (${columns
            .map((c) => sqlValue(row[c]))
            .join(', ')});`,
        );
      }
      rows += page.results.length;
      if (page.results.length < PAGE) break;
    }
  }

  const rest = results.filter((o) => o.type !== 'table');
  if (rest.length) lines.push('', ...rest.map((o) => `${o.sql};`));
  return { sql: `${lines.join('\n')}\n`, tables: tables.length, rows };
}

export async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** Nightly: dump D1 into the backups bucket (retention via the bucket's lifecycle rule). */
export async function backupD1ToR2(db: D1Database, bucket: R2Bucket, now = new Date()) {
  const dump = await dumpD1(db);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const key = `d1/${now.toISOString().slice(0, 7)}/lore-${stamp}.sql.gz`;
  await bucket.put(key, await gzip(dump.sql), {
    httpMetadata: { contentType: 'application/sql', contentEncoding: 'gzip' },
    customMetadata: { tables: String(dump.tables), rows: String(dump.rows) },
  });
  return { key, ...dump, sql: undefined };
}
