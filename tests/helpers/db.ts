/**
 * Test database: an in-memory PGlite instance with the generated migrations
 * applied. Each call returns a fresh database, so tests never share state.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "../../src/db/client";
import * as schema from "../../src/db/schema";

export interface TestDatabase {
  client: PGlite;
  db: Db;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  await client.waitReady;

  const directory = join(process.cwd(), "drizzle");
  const migrations = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrations) {
    const statements = readFileSync(join(directory, file), "utf8");
    await client.exec(statements);
  }

  // PGlite's result types differ from the postgres-js driver, but the query
  // builder surface the services use is identical.
  const db = drizzle(client, { schema }) as unknown as Db;

  return {
    client,
    db,
    reset: async () => {
      await client.exec(`
        DO $$
        DECLARE target record;
        BEGIN
          FOR target IN
            SELECT tablename FROM pg_tables WHERE schemaname = 'public'
          LOOP
            EXECUTE 'TRUNCATE TABLE ' || quote_ident(target.tablename)
              || ' RESTART IDENTITY CASCADE';
          END LOOP;
        END $$;
      `);
    },
    close: async () => {
      await client.close();
    },
  };
}
