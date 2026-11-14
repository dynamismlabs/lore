/**
 * The SQLite schema (canonical) and the Postgres mirror must describe the same
 * tables, columns, nullability, keys and indexes — routers are written once
 * against the SQLite types and run unchanged on Postgres.
 */
import { getTableName, is } from 'drizzle-orm';
import { PgTable, getTableConfig as pgConfig } from 'drizzle-orm/pg-core';
import { SQLiteTable, getTableConfig as sqliteConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import * as pg from './pg';
import * as sqlite from './sqlite';

type Shape = {
  name: string;
  columns: { name: string; notNull: boolean; primary: boolean; hasDefault: boolean }[];
  primaryKeys: string[][];
  indexes: { name: string; unique: boolean; columns: string[] }[];
  foreignKeys: string[];
};

function describeTable(
  config: ReturnType<typeof sqliteConfig> | ReturnType<typeof pgConfig>,
): Shape {
  return {
    name: config.name,
    columns: config.columns
      .map((c) => ({
        name: c.name,
        notNull: c.notNull,
        primary: c.primary,
        hasDefault: c.hasDefault,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    primaryKeys: config.primaryKeys.map((pk) => pk.columns.map((c) => c.name)),
    indexes: config.indexes
      .map((i) => ({
        name: i.config.name ?? '',
        unique: !!i.config.unique,
        columns: i.config.columns.map((c) => ('name' in c ? (c.name as string) : '?')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    foreignKeys: config.foreignKeys
      .map((fk) => {
        const ref = fk.reference();
        return `${ref.columns.map((c) => c.name).join(',')}->${getTableName(ref.foreignTable)}.${ref.foreignColumns
          .map((c) => c.name)
          .join(',')} ${fk.onDelete ?? ''}`;
      })
      .sort(),
  };
}

const sorted = <T>(entries: [string, T][]) => entries.sort(([a], [b]) => a.localeCompare(b));

describe('schema parity', () => {
  const sqliteTables = sorted(
    (Object.entries(sqlite) as [string, unknown][]).filter((e): e is [string, SQLiteTable] =>
      is(e[1], SQLiteTable),
    ),
  );
  const pgTables = sorted(
    (Object.entries(pg) as [string, unknown][]).filter((e): e is [string, PgTable] =>
      is(e[1], PgTable),
    ),
  );

  it('exports the same tables under the same names', () => {
    expect(pgTables.map(([name]) => name)).toEqual(sqliteTables.map(([name]) => name));
  });

  for (const [exportName, table] of sqliteTables) {
    it(`${exportName} matches`, () => {
      const pgTable = (pg as Record<string, unknown>)[exportName] as PgTable;
      expect(describeTable(pgConfig(pgTable))).toEqual(describeTable(sqliteConfig(table)));
    });
  }
});
