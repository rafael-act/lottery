/**
 * Camada de acesso ao banco. As consultas usam "?" como marcador de
 * parâmetro; para o PostgreSQL eles são convertidos para $1, $2...
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let instance;

export async function getDb() {
  if (!instance) {
    instance = config.db.client === 'postgres' ? await createPostgres() : await createSqlite();
  }
  return instance;
}

export async function closeDb() {
  if (instance) {
    await instance.close();
    instance = undefined;
  }
}

async function createSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync(path.dirname(config.db.sqliteFile), { recursive: true });
  const db = new DatabaseSync(config.db.sqliteFile);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  const normalize = (v) => (typeof v === 'boolean' ? Number(v) : v ?? null);
  const query = async (sql, params = []) => {
    const stmt = db.prepare(sql);
    const values = params.map(normalize);
    if (/^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql)) {
      return stmt.all(...values);
    }
    stmt.run(...values);
    return [];
  };

  const api = {
    client: 'sqlite',
    query,
    exec: async (sqlText) => db.exec(sqlText),
    // SQLite usa uma única conexão: as transações devem ser executadas em sequência.
    transaction: async (fn) => {
      db.exec('BEGIN');
      try {
        const result = await fn(api);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    close: async () => db.close(),
  };
  return api;
}

async function createPostgres() {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(1082, (v) => v); // date -> 'AAAA-MM-DD'
  pg.types.setTypeParser(20, (v) => Number(v)); // bigint (COUNT)
  pg.types.setTypeParser(1700, (v) => Number(v)); // numeric

  const pool = new pg.Pool(config.db.postgres);
  const toPg = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };

  return {
    client: 'postgres',
    query: async (sql, params = []) => (await pool.query(toPg(sql), params)).rows,
    exec: async (sqlText) => {
      await pool.query(sqlText);
    },
    transaction: async (fn) => {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const result = await fn({
          client: 'postgres',
          query: async (sql, params = []) => (await conn.query(toPg(sql), params)).rows,
        });
        await conn.query('COMMIT');
        return result;
      } catch (err) {
        await conn.query('ROLLBACK');
        throw err;
      } finally {
        conn.release();
      }
    },
    close: async () => pool.end(),
  };
}
