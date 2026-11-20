import { AsyncLocalStorage } from 'node:async_hooks';
import pg, { type PoolClient, type QueryResultRow } from 'pg';

export type Row = QueryResultRow;

type Param = unknown;

/** Replace SQLite `?` placeholders with Postgres `$1`, `$2`, ... outside quoted text. */
function toPostgresPlaceholders(sql: string): string {
  let out = '';
  let quote: "'" | '"' | null = null;
  let lineComment = false;
  let blockComment = false;
  let index = 0;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i]!;
    const next = sql[i + 1];

    if (lineComment) {
      out += ch;
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      out += ch;
      if (ch === '*' && next === '/') {
        out += '/';
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      out += ch;
      if (ch === quote) {
        if (next === quote) {
          out += next;
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === '-' && next === '-') {
      lineComment = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      out += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '?') {
      index += 1;
      out += `$${index}`;
      continue;
    }
    out += ch;
  }
  return out;
}

function normalizeParams(params: Param[]): unknown[] {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

interface RunResult {
  changes: number;
  lastInsertRowid?: string;
}

interface Statement {
  get<T extends Row = Row>(...params: Param[]): Promise<T | undefined>;
  all<T extends Row = Row>(...params: Param[]): Promise<T[]>;
  run(...params: Param[]): Promise<RunResult>;
}

function quoteIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid PostgreSQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export class PgDb {
  private readonly pool: pg.Pool;
  private readonly transactionClient = new AsyncLocalStorage<PoolClient>();
  private readonly schema?: string;
  private dedicatedClient?: Promise<PoolClient>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(connectionString: string, schema?: string) {
    this.schema = schema;
    this.pool = new pg.Pool({
      connectionString,
      max: 10,
      allowExitOnIdle: true,
    });
    this.pool.on('error', (error) => {
      console.error('Unexpected Postgres pool error', error);
    });
  }

  private async getDedicatedClient(): Promise<PoolClient> {
    if (!this.dedicatedClient) {
      this.dedicatedClient = this.pool
        .connect()
        .then(async (client) => {
          const searchPath = this.searchPathStatement(false);
          if (searchPath) await client.query(searchPath);
          return client;
        })
        .catch((error: unknown) => {
          this.dedicatedClient = undefined;
          throw error;
        });
    }
    return this.dedicatedClient;
  }

  private async runInTransaction<T>(client: PoolClient, work: () => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    try {
      const searchPath = this.searchPathStatement(true);
      if (searchPath) await client.query(searchPath);
      const result = await work();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  private async withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const existing = this.transactionClient.getStore();
    if (existing) return work(existing);

    const run = async (): Promise<T> => {
      const client = await this.getDedicatedClient();
      return work(client);
    };
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private searchPathStatement(local: boolean): string {
    if (!this.schema) return '';
    return `SET ${local ? 'LOCAL ' : ''}search_path TO ${quoteIdentifier(this.schema)}, public`;
  }

  prepare(sql: string): Statement {
    const text = toPostgresPlaceholders(sql);
    return {
      get: async <T extends Row = Row>(...params: Param[]): Promise<T | undefined> => {
        const row = await this.withClient(async (client) => {
          const result = await client.query<T>(text, normalizeParams(params));
          return result.rows[0];
        });
        return row;
      },
      all: async <T extends Row = Row>(...params: Param[]): Promise<T[]> =>
        this.withClient(async (client) => {
          const result = await client.query<T>(text, normalizeParams(params));
          return result.rows;
        }),
      run: async (...params: Param[]): Promise<RunResult> =>
        this.withClient(async (client) => {
          const result = await client.query(text, normalizeParams(params));
          return { changes: result.rowCount ?? 0 };
        }),
    };
  }

  async exec(sql: string): Promise<void> {
    await this.withClient((client) => client.query(sql));
  }

  async query<T extends Row = Row>(sql: string, params: Param[] = []): Promise<T[]> {
    return this.withClient(async (client) => {
      const result = await client.query<T>(toPostgresPlaceholders(sql), normalizeParams(params));
      return result.rows;
    });
  }

  /**
   * Returns a function that runs `body` in a single Postgres transaction.
   * Nested calls reuse the same client via AsyncLocalStorage.
   */
  transaction<T>(body: () => Promise<T>): () => Promise<T> {
    return async () => {
      const existing = this.transactionClient.getStore();
      if (existing) return body();

      const client = await this.pool.connect();
      try {
        return await this.runInTransaction(client, () =>
          this.transactionClient.run(client, body),
        );
      } finally {
        client.release();
      }
    };
  }

  async close(): Promise<void> {
    if (this.dedicatedClient) {
      const client = await this.dedicatedClient.catch(() => undefined);
      this.dedicatedClient = undefined;
      client?.release();
    }
    await this.pool.end();
  }
}

export type Db = PgDb;

export function openDb(connectionString: string, schema?: string): Db {
  return new PgDb(connectionString, schema);
}

export async function openAndMigrate(connectionString: string, schema?: string): Promise<Db> {
  const db = openDb(connectionString, schema);
  const { runMigrations } = await import('./migrations');
  await runMigrations(db);
  return db;
}

/**
 * Allocate a sequential, human friendly identifier such as `FND-0001`.
 * Must be called inside a transaction together with the insert that uses it.
 */
export async function nextSequence(
  db: Db,
  name: string,
  prefix: string,
  width = 4,
): Promise<string> {
  await db.prepare('INSERT INTO sequences (name, next_value) VALUES ($1, 1) ON CONFLICT (name) DO NOTHING').run(name);
  const row = await db
    .prepare('UPDATE sequences SET next_value = next_value + 1 WHERE name = ? RETURNING next_value')
    .get<{ next_value: string | number }>(name);
  const value = Number(row?.next_value ?? 1);
  return `${prefix}-${String(value).padStart(width, '0')}`;
}
