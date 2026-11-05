import { existsSync } from "node:fs";
import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });

try {
  const [row] = await sql<{ database: string; version: string }[]>`
    select current_database() as database, version()
  `;
  const [counts] = await sql<
    { tables: string; business: string; rates: string; hsn: string; users: string }[]
  >`
    select
      (select count(*) from information_schema.tables
        where table_schema = 'public')::text as tables,
      (select count(*) from business)::text as business,
      (select count(*) from tax_rates)::text as rates,
      (select count(*) from hsn_codes)::text as hsn,
      (select count(*) from users)::text as users
  `;
  console.log(`Connected to ${row?.database}`);
  console.log(row?.version);
  console.log(counts);
} catch (error) {
  console.error("Connection failed:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
